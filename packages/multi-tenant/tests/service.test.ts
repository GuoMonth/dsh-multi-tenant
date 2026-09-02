import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AgentNotFoundError,
  AgentProvisioningError,
  CapabilityUnavailableError,
  createPrincipalContext,
  InMemoryTenantAgentRepository,
  IsolationUnavailableError,
  MultiTenantService,
  RuntimePartitionProvider,
  SecretProvider,
  TenantMcpProvider,
  ValidationError,
} from '../src/index.ts'
import type {
  DshAgentSpecification,
  DshRuntimeAgentHandle,
  DshRuntimeDriver,
  RuntimePartitionLease,
  RuntimePartitionRequest,
  SecretLease,
  TenantAgentRuntime,
} from '../src/protocols.ts'
import type { TenantMcpServer, TenantMcpSnapshot } from '../src/mcp.ts'
import type { IsolationLevel, PrincipalContext } from '../src/types.ts'
import { createAgentId } from '../src/types.ts'
import { SQLiteTenantAgentRepository } from '../src/sqlite.ts'

class FakeRuntime implements TenantAgentRuntime {
  readonly cancellations: string[] = []
  readonly toolCalls: Array<{ name: string; args: unknown }> = []

  followup(): void {}
  steer(): void {}
  inject(): void {}
  cancel(reason = ''): void { this.cancellations.push(reason) }
  async whenIdle(): Promise<void> {}
  async executeTool(name: string, args: unknown): Promise<never> {
    this.toolCalls.push({ name, args })
    return { isError: false, value: { name, args }, content: [] } as never
  }
}

interface FakeHandle extends DshRuntimeAgentHandle {
  readonly runtime: FakeRuntime
  readonly specification: DshAgentSpecification
  readonly mode: 'create' | 'resume'
  disposeCount: number
}

class FakeDriver implements DshRuntimeDriver {
  readonly createSpecifications: DshAgentSpecification[] = []
  readonly resumeSpecifications: DshAgentSpecification[] = []
  readonly handles: FakeHandle[] = []
  failCreates = 0
  failResumes = 0

  async create(specification: DshAgentSpecification): Promise<DshRuntimeAgentHandle> {
    this.createSpecifications.push(specification)
    if (this.failCreates-- > 0) throw new Error('create failed')
    return this.handle('create', specification)
  }

  async resume(specification: DshAgentSpecification): Promise<DshRuntimeAgentHandle> {
    this.resumeSpecifications.push(specification)
    if (this.failResumes-- > 0) throw new Error('resume failed')
    return this.handle('resume', specification)
  }

  private handle(mode: 'create' | 'resume', specification: DshAgentSpecification): FakeHandle {
    const handle: FakeHandle = {
      mode,
      specification,
      runtime: new FakeRuntime(),
      disposeCount: 0,
      async dispose() { handle.disposeCount += 1 },
    }
    this.handles.push(handle)
    return handle
  }
}

class MutableMcpProvider extends TenantMcpProvider {
  revision = 'mcp-r1'
  servers: readonly TenantMcpServer[] = []
  error: Error | undefined

  override async load(): Promise<TenantMcpSnapshot> {
    if (this.error !== undefined) throw this.error
    return { revision: this.revision, servers: this.servers }
  }
}

interface IssuedSecretLease extends SecretLease {
  readonly controller: AbortController
  disposed: number
}

class MutableSecretProvider extends SecretProvider {
  revision = 'secret-r1'
  values: Readonly<Record<string, string>> = { token: 'secret-value' }
  readonly issued: IssuedSecretLease[] = []

  override async acquire(
    _principal: PrincipalContext,
    names: readonly string[],
  ): Promise<SecretLease> {
    const selected: Record<string, string> = {}
    for (const name of names) {
      const value = this.values[name]
      if (value === undefined) throw new CapabilityUnavailableError()
      selected[name] = value
    }
    const controller = new AbortController()
    const lease: IssuedSecretLease = {
      revision: this.revision,
      values: Object.freeze(selected),
      signal: controller.signal,
      controller,
      disposed: 0,
      dispose() { lease.disposed += 1 },
    }
    this.issued.push(lease)
    return lease
  }
}

interface PartitionConfig {
  driver: FakeDriver
  isolation?: IsolationLevel
}

class FakePartitionProvider extends RuntimePartitionProvider {
  readonly requests: RuntimePartitionRequest[] = []
  readonly driver: FakeDriver
  isolation: IsolationLevel
  disposed = 0

  constructor(ctx: Context, config: PartitionConfig) {
    super(ctx)
    this.driver = config.driver
    this.isolation = config.isolation ?? 'logical'
  }

  override async acquire(request: RuntimePartitionRequest): Promise<RuntimePartitionLease> {
    this.requests.push(request)
    const provider = this
    return {
      isolation: this.isolation,
      driver: this.driver,
      dispose() { provider.disposed += 1 },
    }
  }
}

interface Harness {
  readonly ctx: Context
  readonly service: MultiTenantService
  readonly repository: InMemoryTenantAgentRepository
  readonly mcp: MutableMcpProvider
  readonly secrets: MutableSecretProvider
  readonly partitions: FakePartitionProvider
  readonly driver: FakeDriver
}

const contexts: Context[] = []
const temporaryDirectories: string[] = []

async function harness(minimumIsolation: IsolationLevel = 'logical'): Promise<Harness> {
  const ctx = new Context()
  contexts.push(ctx)
  const driver = new FakeDriver()
  await ctx.plugin(InMemoryTenantAgentRepository)
  await ctx.plugin(MutableMcpProvider)
  await ctx.plugin(MutableSecretProvider)
  await ctx.plugin(FakePartitionProvider, { driver })
  await ctx.plugin(MultiTenantService, { minimumIsolation })
  return {
    ctx,
    driver,
    service: ctx.multiTenant,
    repository: ctx.tenantAgentRepository as InMemoryTenantAgentRepository,
    mcp: ctx.tenantMcp as MutableMcpProvider,
    secrets: ctx.multiTenantSecrets as MutableSecretProvider,
    partitions: ctx.runtimePartitions as FakePartitionProvider,
  }
}

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.allSettled(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

const alice = () => createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
const bob = () => createPrincipalContext({ tenantId: 'acme', principalId: 'bob' })
const globexAlice = () => createPrincipalContext({ tenantId: 'globex', principalId: 'alice' })

describe('MultiTenantService authority kernel', () => {
  it('generates both identities and exposes only an opaque Agent resource', async () => {
    const test = await harness()
    const agent = await test.service.create(alice(), { meta: { agentPreset: 'minimal' } })
    const specification = test.driver.createSpecifications[0]
    expect(agent.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(specification?.sessionId).toMatch(/^dsh-mt-[0-9a-f-]{36}$/)
    expect(specification?.sessionId).not.toBe(agent.id)
    expect(agent).toEqual({
      id: agent.id,
      state: 'ready',
      mcpServers: [],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
    expect(JSON.stringify(agent)).not.toContain('session')
  })

  it('rejects wire-shaped Principal objects before repository or DSH work', async () => {
    const test = await harness()
    await expect(test.service.create({ tenantId: 'acme', principalId: 'alice' } as PrincipalContext))
      .rejects.toThrow(ValidationError)
    expect(test.driver.createSpecifications).toHaveLength(0)
    await expect(test.repository.list({ tenantId: 'acme', principalId: 'alice' })).resolves.toEqual([])
  })

  it('makes unknown, cross-Principal, cross-Tenant, failed and deleted resources indistinguishable', async () => {
    const test = await harness()
    const owner = alice()
    const agent = await test.service.create(owner)
    const failures = await Promise.all([
      test.service.get(bob(), agent.id).catch(error => error),
      test.service.get(globexAlice(), agent.id).catch(error => error),
      test.service.get(owner, createAgentId()).catch(error => error),
    ])
    expect(failures.every(error => error instanceof AgentNotFoundError)).toBe(true)
    expect(new Set(failures.map(error => `${error.code}:${error.message}`))).toEqual(new Set([
      'AGENT_NOT_FOUND:Agent not found.',
    ]))

    await expect(test.service.delete(bob(), agent.id)).rejects.toThrow(AgentNotFoundError)
    expect(test.driver.handles[0]?.runtime.cancellations).toHaveLength(0)
    await test.service.delete(owner, agent.id)
    await expect(test.service.get(owner, agent.id)).rejects.toThrow(AgentNotFoundError)
  })

  it('never publishes failed provisioning and retries with a fresh resource', async () => {
    const test = await harness()
    const principal = alice()
    test.driver.failCreates = 1
    await expect(test.service.create(principal)).rejects.toThrow(AgentProvisioningError)
    const internal = await test.repository.list(principal)
    expect(internal).toHaveLength(1)
    expect(internal[0]?.state).toBe('failed')
    await expect(test.service.get(principal, internal[0]!.id)).rejects.toThrow(AgentNotFoundError)
    await expect(test.service.list(principal)).resolves.toEqual([])

    const retry = await test.service.create(principal)
    expect(retry.id).not.toBe(internal[0]?.id)
    expect(test.driver.createSpecifications).toHaveLength(2)
  })

  it('does not start DSH when repository reservation fails', async () => {
    const test = await harness()
    test.repository.insert = async () => { throw new Error('database unavailable') }
    await expect(test.service.create(alice())).rejects.toThrow(AgentProvisioningError)
    expect(test.driver.createSpecifications).toHaveLength(0)
    expect(test.partitions.disposed).toBe(1)
  })

  it('disposes DSH and hides the record when the ready commit loses its CAS', async () => {
    const test = await harness()
    const transition = test.repository.transition.bind(test.repository)
    test.repository.transition = async (principal, id, revision, change) => {
      if (change.to === 'ready') return undefined
      return transition(principal, id, revision, change)
    }
    const principal = alice()
    await expect(test.service.create(principal)).rejects.toThrow(AgentProvisioningError)
    expect(test.driver.handles[0]?.disposeCount).toBe(1)
    await expect(test.service.list(principal)).resolves.toEqual([])
    expect((await test.repository.list(principal))[0]?.state).toBe('failed')
  })

  it('single-flights concurrent resume and exposes only the controlled runtime view', async () => {
    const test = await harness()
    const principal = alice()
    const id = createAgentId()
    const inserted = await test.repository.insert({
      id,
      tenantId: principal.tenantId,
      principalId: principal.principalId,
      sessionId: 'dsh-mt-existing',
      policyRevision: 'policy-v1',
      capabilityRevision: 'old',
      mcpServers: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    await test.repository.transition(principal, id, inserted.revision, {
      from: 'provisioning', to: 'ready', at: '2026-01-01T00:00:01.000Z',
    })
    const keys: string[][] = []
    await Promise.all([
      test.service.withAgent(principal, id, async runtime => { keys.push(Object.keys(runtime).sort()) }),
      test.service.withAgent(principal, id, async runtime => { keys.push(Object.keys(runtime).sort()) }),
    ])
    expect(test.driver.resumeSpecifications).toHaveLength(1)
    expect(keys).toEqual([
      ['cancel', 'executeTool', 'followup', 'inject', 'steer', 'whenIdle'],
      ['cancel', 'executeTool', 'followup', 'inject', 'steer', 'whenIdle'],
    ])
  })

  it('reopens Alice from SQLite with the same internal session, then deletes it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-service-restart-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'agents.sqlite')

    const open = async () => {
      const ctx = new Context()
      contexts.push(ctx)
      const driver = new FakeDriver()
      await ctx.plugin(SQLiteTenantAgentRepository, { path })
      await ctx.plugin(MutableMcpProvider)
      await ctx.plugin(MutableSecretProvider)
      await ctx.plugin(FakePartitionProvider, { driver })
      await ctx.plugin(MultiTenantService)
      return { ctx, driver, service: ctx.multiTenant }
    }

    const first = await open()
    const principal = alice()
    const agent = await first.service.create(principal)
    await first.service.withAgent(principal, agent.id, async runtime => runtime.whenIdle())
    const internalSession = first.driver.createSpecifications[0]?.sessionId
    await first.ctx.fiber.dispose()

    const second = await open()
    const restartedPrincipal = alice()
    await expect(second.service.get(restartedPrincipal, agent.id)).resolves.toEqual(expect.objectContaining({ id: agent.id }))
    await second.service.withAgent(restartedPrincipal, agent.id, async runtime => runtime.whenIdle())
    expect(second.driver.resumeSpecifications[0]?.sessionId).toBe(internalSession)
    await second.service.delete(restartedPrincipal, agent.id)
    await expect(second.service.get(restartedPrincipal, agent.id)).rejects.toThrow(AgentNotFoundError)
  })

  it('cancels immediately on authorized delete, then drains and tombstones', async () => {
    const test = await harness()
    const principal = alice()
    const agent = await test.service.create(principal)
    const gate = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    const use = test.service.withAgent(principal, agent.id, async () => {
      entered.resolve()
      await gate.promise
    })
    await entered.promise
    const deletion = test.service.delete(principal, agent.id)
    await new Promise(resolve => setImmediate(resolve))
    expect(test.driver.handles[0]?.runtime.cancellations).toContain('Agent deleted')
    gate.resolve()
    await Promise.all([use, deletion])
    expect(test.driver.handles[0]?.disposeCount).toBe(1)
    const tombstone = await test.repository.get(principal, agent.id)
    expect(tombstone).toEqual(expect.objectContaining({ state: 'deleted', mcpServers: [] }))
  })

  it('revokes a secret-backed live Agent and resumes the same internal session with a fresh lease', async () => {
    const test = await harness()
    test.mcp.servers = [{
      transport: 'stdio',
      serverName: 'private',
      command: 'node',
      secretEnv: { TOKEN: { secret: 'token' } },
    }]
    const principal = alice()
    const agent = await test.service.create(principal)
    const originalSession = test.driver.createSpecifications[0]?.sessionId
    expect(test.secrets.issued).toHaveLength(1)
    expect(test.driver.createSpecifications[0]?.mcpServers[0]).toEqual(expect.objectContaining({
      serverName: 'private',
      env: { TOKEN: 'secret-value' },
    }))
    expect(JSON.stringify(await test.repository.list(principal))).not.toContain('secret-value')

    test.secrets.issued[0]!.controller.abort()
    await new Promise(resolve => setImmediate(resolve))
    expect(test.driver.handles[0]?.runtime.cancellations).toContain('secret lease revoked')
    expect(test.driver.handles[0]?.disposeCount).toBe(1)

    await test.service.withAgent(principal, agent.id, async runtime => {
      await runtime.executeTool('mcp__private__ping', { value: 1 })
    })
    expect(test.secrets.issued).toHaveLength(2)
    expect(test.driver.resumeSpecifications).toHaveLength(1)
    expect(test.driver.resumeSpecifications[0]?.sessionId).toBe(originalSession)
  })

  it('allows the same MCP serverName in two independent Agent scopes', async () => {
    const test = await harness()
    test.mcp.servers = [{ transport: 'stdio', serverName: 'shared', command: 'node' }]
    const principal = alice()
    const [first, second] = await Promise.all([
      test.service.create(principal),
      test.service.create(principal),
    ])
    expect(first.id).not.toBe(second.id)
    expect(test.driver.createSpecifications.map(spec => spec.mcpServers[0]?.serverName)).toEqual(['shared', 'shared'])
  })

  it('fails closed on insufficient isolation before creating a DSH Agent', async () => {
    const test = await harness('strong')
    await expect(test.service.create(alice(), { minimumIsolation: 'logical' } as never))
      .rejects.toThrow(IsolationUnavailableError)
    expect(test.partitions.requests[0]?.requiredIsolation).toBe('strong')
    expect(test.driver.createSpecifications).toHaveLength(0)
    await expect(test.repository.list({ tenantId: 'acme', principalId: 'alice' })).resolves.toEqual([])
  })

  it('maps MCP provider failure to capability unavailability before DSH work', async () => {
    const test = await harness()
    test.mcp.error = new Error('provider unavailable')
    await expect(test.service.create(alice())).rejects.toThrow(CapabilityUnavailableError)
    expect(test.driver.createSpecifications).toHaveLength(0)
  })

  it('cancels and disposes all live handles when the plugin closes', async () => {
    const test = await harness()
    await Promise.all([test.service.create(alice()), test.service.create(bob())])
    await test.service.close()
    expect(test.driver.handles.every(handle => handle.runtime.cancellations.includes('multi-tenant service disposed'))).toBe(true)
    expect(test.driver.handles.every(handle => handle.disposeCount === 1)).toBe(true)
  })
})
