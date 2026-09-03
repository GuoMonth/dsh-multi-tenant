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
  ServiceClosedError,
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

function waitForAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

class FakeRuntime implements TenantAgentRuntime {
  readonly cancellations: string[] = []
  readonly toolCalls: Array<{ name: string; args: unknown }> = []
  readonly calls: string[] = []

  followup(): void { this.calls.push('followup') }
  steer(): void { this.calls.push('steer') }
  inject(): void { this.calls.push('inject') }
  cancel(reason = ''): void {
    this.calls.push('cancel')
    this.cancellations.push(reason)
  }
  async whenIdle(): Promise<void> { this.calls.push('whenIdle') }
  async executeTool(name: string, args: unknown): Promise<never> {
    this.calls.push('executeTool')
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
  blockCreates = false
  blockResumes = false
  readonly createEntered = Promise.withResolvers<void>()
  readonly resumeEntered = Promise.withResolvers<void>()
  cleanupEvents: string[] = []

  async create(specification: DshAgentSpecification): Promise<DshRuntimeAgentHandle> {
    this.createSpecifications.push(specification)
    if (this.failCreates-- > 0) throw new Error('create failed')
    if (this.blockCreates) {
      this.createEntered.resolve()
      await waitForAbort(specification.signal)
    }
    return this.handle('create', specification)
  }

  async resume(specification: DshAgentSpecification): Promise<DshRuntimeAgentHandle> {
    this.resumeSpecifications.push(specification)
    if (this.failResumes-- > 0) throw new Error('resume failed')
    if (this.blockResumes) {
      this.resumeEntered.resolve()
      await waitForAbort(specification.signal)
    }
    return this.handle('resume', specification)
  }

  private handle(mode: 'create' | 'resume', specification: DshAgentSpecification): FakeHandle {
    const thisDriver = this
    const handle: FakeHandle = {
      mode,
      specification,
      runtime: new FakeRuntime(),
      disposeCount: 0,
      async dispose() {
        handle.disposeCount += 1
        thisDriver.cleanupEvents.push('handle')
      },
    }
    this.handles.push(handle)
    return handle
  }
}

class MutableMcpProvider extends TenantMcpProvider {
  revision = 'mcp-r1'
  servers: readonly TenantMcpServer[] = []
  error: Error | undefined
  block = false
  readonly entered = Promise.withResolvers<void>()
  readonly signals: AbortSignal[] = []

  override async load(_principal: PrincipalContext, signal: AbortSignal): Promise<TenantMcpSnapshot> {
    this.signals.push(signal)
    if (this.error !== undefined) throw this.error
    if (this.block) {
      this.entered.resolve()
      await waitForAbort(signal)
    }
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
  readonly signals: AbortSignal[] = []
  block = false
  readonly entered = Promise.withResolvers<void>()
  cleanupEvents: string[] = []

  override async acquire(
    _principal: PrincipalContext,
    names: readonly string[],
    signal: AbortSignal,
  ): Promise<SecretLease> {
    this.signals.push(signal)
    if (this.block) {
      this.entered.resolve()
      await waitForAbort(signal)
    }
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
      dispose: () => {
        lease.disposed += 1
        this.cleanupEvents.push('secret')
      },
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
  block = false
  readonly entered = Promise.withResolvers<void>()
  cleanupEvents: string[] = []

  constructor(ctx: Context, config: PartitionConfig) {
    super(ctx)
    this.driver = config.driver
    this.isolation = config.isolation ?? 'logical'
  }

  override async acquire(request: RuntimePartitionRequest): Promise<RuntimePartitionLease> {
    this.requests.push(request)
    if (this.block) {
      this.entered.resolve()
      await waitForAbort(request.signal)
    }
    const provider = this
    return {
      isolation: this.isolation,
      driver: this.driver,
      dispose() {
        provider.disposed += 1
        provider.cleanupEvents.push('partition')
      },
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

function expectExpired(runtime: TenantAgentRuntime): void {
  const calls = [
    () => runtime.followup({} as never),
    () => runtime.steer({} as never),
    () => runtime.inject({} as never),
    () => runtime.cancel('late'),
    () => runtime.whenIdle(),
    () => runtime.executeTool('late', {}),
  ]
  for (const call of calls) expect(call).toThrow(CapabilityUnavailableError)
}

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

  it('strictly rebuilds trusted create options and rejects unknown nested fields', async () => {
    const test = await harness()
    await expect(test.service.create(alice(), {
      agentOptions: { model: 'coder', temperature: 1 } as never,
    })).rejects.toThrow(ValidationError)
    await expect(test.service.create(alice(), {
      meta: { cwd: '/srv/workspace', owner: 'alice' } as never,
    })).rejects.toThrow(ValidationError)
    await expect(test.service.create(alice(), { profile: 'coding' } as never))
      .rejects.toThrow(ValidationError)
    expect(test.driver.createSpecifications).toHaveLength(0)
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

  it('expires every callback-scoped runtime method after resolve or reject', async () => {
    const test = await harness()
    const principal = alice()
    const agent = await test.service.create(principal)
    let resolved: TenantAgentRuntime | undefined
    await test.service.withAgent(principal, agent.id, async runtime => {
      resolved = runtime
      runtime.followup({} as never)
      runtime.steer({} as never)
      runtime.inject({} as never)
      runtime.cancel('inside')
      await runtime.whenIdle()
      await runtime.executeTool('inside', {})
    })
    expect(test.driver.handles[0]?.runtime.calls).toEqual([
      'followup', 'steer', 'inject', 'cancel', 'whenIdle', 'executeTool',
    ])
    expectExpired(resolved!)

    let rejected: TenantAgentRuntime | undefined
    await expect(test.service.withAgent(principal, agent.id, async runtime => {
      rejected = runtime
      throw new Error('callback failed')
    })).rejects.toThrow('callback failed')
    expectExpired(rejected!)
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

  it('hides abandoned provisioning after restart and retries with fresh identities without resuming DSH', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-abandoned-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'agents.sqlite')
    const owner = alice()
    const abandonedId = createAgentId()
    const abandonedSession = 'dsh-mt-abandoned-session'

    const first = new Context()
    const repository = new SQLiteTenantAgentRepository(first, { path })
    await repository.insert({
      id: abandonedId,
      tenantId: owner.tenantId,
      principalId: owner.principalId,
      sessionId: abandonedSession,
      capabilityRevision: 'abandoned-capability',
      mcpServers: ['abandoned'],
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    await first.fiber.dispose()

    const second = new Context()
    contexts.push(second)
    const driver = new FakeDriver()
    await second.plugin(SQLiteTenantAgentRepository, { path })
    await second.plugin(MutableMcpProvider)
    await second.plugin(MutableSecretProvider)
    await second.plugin(FakePartitionProvider, { driver })
    await second.plugin(MultiTenantService)

    await expect(second.multiTenant.get(owner, abandonedId)).rejects.toThrow(AgentNotFoundError)
    await expect(second.multiTenant.withAgent(owner, abandonedId, async () => undefined))
      .rejects.toThrow(AgentNotFoundError)
    expect(driver.createSpecifications).toHaveLength(0)
    expect(driver.resumeSpecifications).toHaveLength(0)
    expect(await second.tenantAgentRepository.get(owner, abandonedId)).toEqual(expect.objectContaining({
      state: 'failed', revision: 1, sessionId: abandonedSession,
    }))

    const retry = await second.multiTenant.create(owner)
    expect(retry.id).not.toBe(abandonedId)
    expect(driver.createSpecifications[0]?.sessionId).not.toBe(abandonedSession)
  })

  it('cancels immediately and prevents a later withAgent from overtaking deletion', async () => {
    const test = await harness()
    const principal = alice()
    const agent = await test.service.create(principal)
    const gate = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    let retained: TenantAgentRuntime | undefined
    const use = test.service.withAgent(principal, agent.id, async runtime => {
      retained = runtime
      entered.resolve()
      await gate.promise
    })
    await entered.promise
    const deletion = test.service.delete(principal, agent.id)
    let enteredAfterDelete = false
    const queuedUse = expect(test.service.withAgent(principal, agent.id, async () => {
      enteredAfterDelete = true
    })).rejects.toThrow(AgentNotFoundError)
    await new Promise(resolve => setImmediate(resolve))
    expect(test.driver.handles[0]?.runtime.cancellations).toContain('Agent deleted')
    expectExpired(retained!)
    gate.resolve()
    await Promise.all([use, deletion, queuedUse])
    expect(enteredAfterDelete).toBe(false)
    expect(test.driver.resumeSpecifications).toHaveLength(0)
    expect(test.driver.handles[0]?.disposeCount).toBe(1)
    const tombstone = await test.repository.get(principal, agent.id)
    expect(tombstone).toEqual(expect.objectContaining({ state: 'deleted', mcpServers: [] }))
  })

  it('allows owner use after an unauthorized delete without touching the live Agent', async () => {
    const test = await harness()
    const principal = alice()
    const agent = await test.service.create(principal)

    await expect(test.service.delete(bob(), agent.id)).rejects.toThrow(AgentNotFoundError)
    await test.service.withAgent(principal, agent.id, async runtime => runtime.whenIdle())

    expect(test.driver.resumeSpecifications).toHaveLength(0)
    expect(test.driver.handles[0]?.runtime.cancellations).toHaveLength(0)
    expect(test.driver.handles[0]?.disposeCount).toBe(0)
  })

  it('serializes concurrent deletes and disposes the live handle once', async () => {
    const test = await harness()
    test.mcp.servers = [{
      transport: 'stdio', serverName: 'private', command: 'node',
      secretEnv: { TOKEN: { secret: 'token' } },
    }]
    const principal = alice()
    const agent = await test.service.create(principal)

    const results = await Promise.allSettled([
      test.service.delete(principal, agent.id),
      test.service.delete(principal, agent.id),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected).toEqual(expect.objectContaining({
      reason: expect.any(AgentNotFoundError),
    }))
    expect(test.driver.resumeSpecifications).toHaveLength(0)
    expect(test.driver.handles[0]?.disposeCount).toBe(1)
    expect(test.partitions.disposed).toBe(1)
    expect(test.secrets.issued[0]?.disposed).toBe(1)
  })

  it('keeps a ready record usable when its durable delete transition fails', async () => {
    const test = await harness()
    const principal = alice()
    const agent = await test.service.create(principal)
    const transition = test.repository.transition.bind(test.repository)
    let failDelete = true
    test.repository.transition = async (owner, id, revision, change) => {
      if (change.to === 'deleted' && failDelete) {
        failDelete = false
        throw new Error('database delete failed')
      }
      return transition(owner, id, revision, change)
    }

    await expect(test.service.delete(principal, agent.id)).rejects.toThrow('database delete failed')
    await expect(test.service.get(principal, agent.id)).resolves.toEqual(expect.objectContaining({ id: agent.id }))
    await test.service.withAgent(principal, agent.id, async runtime => runtime.whenIdle())

    expect(test.driver.handles[0]?.runtime.cancellations).toContain('Agent deleted')
    expect(test.driver.handles[0]?.disposeCount).toBe(1)
    expect(test.driver.resumeSpecifications).toHaveLength(1)
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

  it('invalidates an active callback facade as soon as its secret lease is revoked', async () => {
    const test = await harness()
    test.mcp.servers = [{
      transport: 'stdio',
      serverName: 'private',
      command: 'node',
      secretEnv: { TOKEN: { secret: 'token' } },
    }]
    const principal = alice()
    const agent = await test.service.create(principal)
    const gate = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    let retained: TenantAgentRuntime | undefined
    const use = test.service.withAgent(principal, agent.id, async runtime => {
      retained = runtime
      entered.resolve()
      await gate.promise
    })
    await entered.promise
    test.secrets.issued[0]!.controller.abort()
    expectExpired(retained!)
    gate.resolve()
    await use
    await new Promise(resolve => setImmediate(resolve))
    expect(test.driver.handles[0]?.disposeCount).toBe(1)
  })

  it('does not revive an expired facade when capability refresh replaces the live Agent', async () => {
    const test = await harness()
    const principal = alice()
    const agent = await test.service.create(principal)
    let oldRuntime: TenantAgentRuntime | undefined
    await test.service.withAgent(principal, agent.id, async runtime => { oldRuntime = runtime })
    test.mcp.revision = 'mcp-r2'
    let refreshedRuntime: TenantAgentRuntime | undefined
    await test.service.withAgent(principal, agent.id, async runtime => {
      refreshedRuntime = runtime
      await runtime.whenIdle()
    })
    expect(oldRuntime).not.toBe(refreshedRuntime)
    expectExpired(oldRuntime!)
    expectExpired(refreshedRuntime!)
    expect(test.driver.handles[0]?.disposeCount).toBe(1)
    expect(test.driver.resumeSpecifications).toHaveLength(1)
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
      .rejects.toThrow(ValidationError)
    expect(test.partitions.requests).toHaveLength(0)
    await expect(test.service.create(alice())).rejects.toThrow(IsolationUnavailableError)
    expect(test.partitions.requests[0]?.requiredIsolation).toBe('strong')
    expect(test.driver.createSpecifications).toHaveLength(0)
    await expect(test.repository.list({ tenantId: 'acme', principalId: 'alice' })).resolves.toEqual([])
  })

  it('passes the service lifecycle and combined secret-revocation signal through every provider seam', async () => {
    const test = await harness()
    test.mcp.servers = [{
      transport: 'stdio',
      serverName: 'private',
      command: 'node',
      secretEnv: { TOKEN: { secret: 'token' } },
    }]

    await test.service.create(alice())
    const lifecycle = test.mcp.signals[0]
    const combined = test.partitions.requests[0]?.signal
    expect(lifecycle).toBeInstanceOf(AbortSignal)
    expect(test.secrets.signals[0]).toBe(lifecycle)
    expect(combined).toBeInstanceOf(AbortSignal)
    expect(combined).not.toBe(lifecycle)
    expect(test.driver.createSpecifications[0]?.signal).toBe(combined)
    expect(combined?.aborted).toBe(false)

    test.secrets.issued[0]!.controller.abort()
    expect(combined?.aborted).toBe(true)
  })

  it.each(['mcp', 'secret', 'partition', 'driver'] as const)(
    'aborts pending %s acquisition or setup and maps shutdown to ServiceClosedError',
    async stage => {
      const test = await harness()
      if (stage === 'secret') {
        test.mcp.servers = [{
          transport: 'stdio', serverName: 'private', command: 'node',
          secretEnv: { TOKEN: { secret: 'token' } },
        }]
      }
      if (stage === 'mcp') test.mcp.block = true
      if (stage === 'secret') test.secrets.block = true
      if (stage === 'partition') test.partitions.block = true
      if (stage === 'driver') test.driver.blockCreates = true

      const creation = test.service.create(alice())
      const entered = stage === 'mcp'
        ? test.mcp.entered.promise
        : stage === 'secret'
          ? test.secrets.entered.promise
          : stage === 'partition'
            ? test.partitions.entered.promise
            : test.driver.createEntered.promise
      await entered
      const signal = stage === 'mcp'
        ? test.mcp.signals[0]!
        : stage === 'secret'
          ? test.secrets.signals[0]!
          : stage === 'partition'
            ? test.partitions.requests[0]!.signal
            : test.driver.createSpecifications[0]!.signal

      const closed = expect(creation).rejects.toThrow(ServiceClosedError)
      const closing = test.service.close()
      expect(signal.aborted).toBe(true)
      await Promise.all([closed, closing])
      expect(test.driver.createSpecifications).toHaveLength(stage === 'driver' ? 1 : 0)
    },
  )

  it.each([
    'mcp-revision',
    'secret-values',
    'secret-signal',
    'partition-isolation',
    'partition-driver',
    'partition-disposer',
  ] as const)('rejects malformed %s results before DSH work', async kind => {
    const test = await harness()
    let malformedDisposals = 0
    if (kind.startsWith('secret')) {
      test.mcp.servers = [{
        transport: 'stdio', serverName: 'private', command: 'node',
        secretEnv: { TOKEN: { secret: 'token' } },
      }]
    }
    if (kind === 'mcp-revision') {
      test.mcp.load = async () => ({ revision: '', servers: [] })
    } else if (kind === 'secret-values') {
      test.secrets.acquire = async () => ({
        revision: 'secret-r1', values: { token: 7 }, signal: new AbortController().signal,
        dispose() { malformedDisposals += 1 },
      }) as never
    } else if (kind === 'secret-signal') {
      test.secrets.acquire = async () => ({
        revision: 'secret-r1', values: { token: 'do-not-leak' }, signal: { aborted: false },
        dispose() { malformedDisposals += 1 },
      }) as never
    } else if (kind === 'partition-isolation') {
      test.partitions.acquire = async () => ({
        isolation: 'sandbox', driver: test.driver,
        dispose() { malformedDisposals += 1 },
      }) as never
    } else if (kind === 'partition-driver') {
      test.partitions.acquire = async () => ({
        isolation: 'logical', driver: {},
        dispose() { malformedDisposals += 1 },
      }) as never
    } else {
      test.partitions.acquire = async () => ({ isolation: 'logical', driver: test.driver }) as never
    }

    const error = await test.service.create(alice()).catch(reason => reason)
    expect(error).toBeInstanceOf(CapabilityUnavailableError)
    expect(`${error.message}:${String(error.cause)}`).not.toContain('do-not-leak')
    expect(test.driver.createSpecifications).toHaveLength(0)
    expect(malformedDisposals).toBe(kind === 'mcp-revision' || kind === 'partition-disposer' ? 0 : 1)
  })

  it.each(['runtime-method', 'handle-disposer'] as const)(
    'rejects a DSH handle with a missing %s and does not publish it',
    async kind => {
      const test = await harness()
      let malformedDisposals = 0
      test.driver.create = async specification => {
        test.driver.createSpecifications.push(specification)
        return {
          runtime: kind === 'runtime-method'
            ? { followup() {}, steer() {}, inject() {}, cancel() {}, async whenIdle() {} }
            : new FakeRuntime(),
          ...(kind === 'handle-disposer' ? {} : {
            async dispose() { malformedDisposals += 1 },
          }),
        } as never
      }

      const principal = alice()
      await expect(test.service.create(principal)).rejects.toThrow(AgentProvisioningError)
      expect(test.driver.createSpecifications).toHaveLength(1)
      expect(malformedDisposals).toBe(kind === 'runtime-method' ? 1 : 0)
      expect((await test.repository.list(principal))[0]?.state).toBe('failed')
    },
  )

  it('aborts a pending resume when its SecretLease is revoked', async () => {
    const test = await harness()
    test.mcp.servers = [{
      transport: 'stdio', serverName: 'private', command: 'node',
      secretEnv: { TOKEN: { secret: 'token' } },
    }]
    const principal = alice()
    const agent = await test.service.create(principal)
    test.secrets.issued[0]!.controller.abort()
    await new Promise(resolve => setImmediate(resolve))

    test.driver.blockResumes = true
    const use = test.service.withAgent(principal, agent.id, async () => undefined)
    await test.driver.resumeEntered.promise
    test.secrets.issued[1]!.controller.abort()

    await expect(use).rejects.toThrow(CapabilityUnavailableError)
    expect(test.driver.resumeSpecifications[0]?.signal.aborted).toBe(true)
    expect((await test.repository.get(principal, agent.id))?.state).toBe('ready')
  })

  it('disposes live resources in handle, partition, secret order', async () => {
    const test = await harness()
    const events: string[] = []
    test.driver.cleanupEvents = events
    test.partitions.cleanupEvents = events
    test.secrets.cleanupEvents = events
    test.mcp.servers = [{
      transport: 'stdio', serverName: 'private', command: 'node',
      secretEnv: { TOKEN: { secret: 'token' } },
    }]
    const principal = alice()
    const agent = await test.service.create(principal)

    await test.service.delete(principal, agent.id)
    expect(events).toEqual(['handle', 'partition', 'secret'])
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

  it('invalidates an active callback facade before shutdown drain completes', async () => {
    const test = await harness()
    const agent = await test.service.create(alice())
    const gate = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    let retained: TenantAgentRuntime | undefined
    const use = test.service.withAgent(alice(), agent.id, async runtime => {
      retained = runtime
      entered.resolve()
      await gate.promise
    })
    await entered.promise
    const closing = test.service.close()
    expectExpired(retained!)
    gate.resolve()
    await Promise.all([use, closing])
  })
})
