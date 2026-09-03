/** Multi-tenant authority kernel and owned DSH Agent lifecycle. */

import { createHash } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import {
  AgentNotFoundError,
  AgentProvisioningError,
  CapabilityUnavailableError,
  IsolationUnavailableError,
  ServiceClosedError,
} from './errors.ts'
import {
  normalizeTenantMcpSnapshot,
  requiredSecretNames,
  resolveMcpServers,
  type TenantMcpProvider,
  type TenantMcpSnapshot,
} from './mcp.ts'
import type {
  RuntimePartitionLease,
  RuntimePartitionProvider,
  SecretLease,
  SecretProvider,
  TenantAgentRuntime,
  DshRuntimeAgentHandle,
} from './protocols.ts'
import type { TenantAgentRepository } from './repository.ts'
import { emptySecretLease } from './secrets.ts'
import {
  assertPrincipalContext,
  createAgentId,
  createInternalSessionId,
  parseAgentId,
  validateCreateAgentOptions,
  type AgentId,
  type CreateAgentOptions,
  type IsolationLevel,
  type PrincipalContext,
  type TenantAgent,
  type TenantAgentRecord,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    multiTenant: MultiTenantService
  }
}

export interface MultiTenantConfig {
  readonly minimumIsolation?: IsolationLevel
}

interface PreparedCapabilities {
  readonly snapshot: TenantMcpSnapshot
  readonly secret: SecretLease
  readonly partition: RuntimePartitionLease
  readonly capabilityRevision: string
}

interface RuntimeScope {
  readonly runtime: TenantAgentRuntime
  invalidate(): void
}

interface LiveAgent {
  readonly handle: DshRuntimeAgentHandle
  readonly secret: SecretLease
  readonly partition: RuntimePartitionLease
  readonly capabilityRevision: string
  readonly scopes: Set<RuntimeScope>
  detachRevocation(): void
  invalidated: boolean
}

function summary(record: TenantAgentRecord): TenantAgent {
  return Object.freeze({
    id: record.id,
    state: 'ready' as const,
    mcpServers: Object.freeze([...record.mcpServers]),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })
}

function meets(actual: IsolationLevel, required: IsolationLevel): boolean {
  return required === 'logical' || actual === 'strong'
}

function controlledRuntime(runtime: TenantAgentRuntime, available: () => boolean): RuntimeScope {
  let active = true
  const assertActive = (): void => {
    if (!active || !available()) {
      throw new CapabilityUnavailableError('The Agent runtime scope is no longer active.')
    }
  }
  return {
    runtime: Object.freeze({
      followup(message: Parameters<TenantAgentRuntime['followup']>[0]) {
        assertActive()
        runtime.followup(message)
      },
      steer(message: Parameters<TenantAgentRuntime['steer']>[0]) {
        assertActive()
        runtime.steer(message)
      },
      inject(message: Parameters<TenantAgentRuntime['inject']>[0]) {
        assertActive()
        runtime.inject(message)
      },
      cancel(reason?: string) {
        assertActive()
        runtime.cancel(reason)
      },
      whenIdle() {
        assertActive()
        return runtime.whenIdle()
      },
      executeTool(
        name: string,
        args: unknown,
        options?: Parameters<TenantAgentRuntime['executeTool']>[2],
      ) {
        assertActive()
        return runtime.executeTool(name, args, options)
      },
    }),
    invalidate() {
      active = false
    },
  }
}

function capabilityRevision(snapshot: TenantMcpSnapshot, secret: SecretLease, isolation: IsolationLevel): string {
  return createHash('sha256')
    .update(JSON.stringify([snapshot.revision, secret.revision, isolation]))
    .digest('hex')
}

async function settleDisposers(disposers: Array<() => void | PromiseLike<void>>, message: string): Promise<void> {
  const errors: unknown[] = []
  for (const dispose of disposers) {
    try {
      await dispose()
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, message)
}

export class MultiTenantService extends Service {
  private readonly minimumIsolation: IsolationLevel
  private readonly live = new Map<AgentId, LiveAgent>()
  private readonly tails = new Map<AgentId, Promise<void>>()
  private accepting = true
  private closing: Promise<void> | undefined

  constructor(ctx: Context, config: MultiTenantConfig = {}) {
    super(ctx, 'multiTenant')
    this.minimumIsolation = config.minimumIsolation ?? 'logical'
    if (this.minimumIsolation !== 'logical' && this.minimumIsolation !== 'strong') {
      throw new TypeError('minimumIsolation must be logical or strong')
    }
    ctx.effect(() => () => this.close(), 'dsh-multi-tenant: drain owned Agents')
  }

  async create(principal: PrincipalContext, options?: CreateAgentOptions): Promise<TenantAgent> {
    this.assertAccepting()
    assertPrincipalContext(principal)
    const normalized = validateCreateAgentOptions(options)
    const id = createAgentId()
    return this.serial(id, async () => {
      const prepared = await this.prepareCapabilities(principal, id)
      const sessionId = createInternalSessionId()
      const now = new Date().toISOString()
      let record: TenantAgentRecord | undefined
      let handle: DshRuntimeAgentHandle | undefined
      try {
        const resolved = resolveMcpServers(prepared.snapshot, prepared.secret)
        record = await this.repository.insert({
          id,
          tenantId: principal.tenantId,
          principalId: principal.principalId,
          sessionId,
          capabilityRevision: prepared.capabilityRevision,
          mcpServers: prepared.snapshot.servers.map(server => server.serverName),
          createdAt: now,
        })
        handle = await prepared.partition.driver.create({
          sessionId,
          mcpServers: resolved,
          signal: prepared.secret.signal,
          ...normalized,
        })
        prepared.secret.signal.throwIfAborted()
        const ready = await this.repository.transition(principal, id, record.revision, {
          from: 'provisioning',
          to: 'ready',
          at: new Date().toISOString(),
        })
        if (ready === undefined) throw new Error('Agent publication lost its repository reservation')
        this.installLive(id, handle, prepared)
        return summary(ready)
      } catch (error) {
        if (record !== undefined) {
          await this.repository.transition(principal, id, record.revision, {
            from: 'provisioning',
            to: 'failed',
            at: new Date().toISOString(),
          }).catch(() => undefined)
        }
        const cleanup: Array<() => void | PromiseLike<void>> = [
          () => prepared.partition.dispose(),
          () => prepared.secret.dispose(),
        ]
        if (handle !== undefined) cleanup.unshift(() => handle!.dispose())
        await settleDisposers(cleanup, 'failed Agent provisioning cleanup failed').catch(() => undefined)
        if (error instanceof CapabilityUnavailableError || error instanceof IsolationUnavailableError) throw error
        if (prepared.secret.signal.aborted) throw new CapabilityUnavailableError('Agent capabilities were revoked.')
        throw new AgentProvisioningError({ cause: error })
      }
    })
  }

  async get(principal: PrincipalContext, id: AgentId): Promise<TenantAgent> {
    this.assertAccepting()
    assertPrincipalContext(principal)
    return summary(await this.readyRecord(principal, parseAgentId(id)))
  }

  async list(principal: PrincipalContext): Promise<readonly TenantAgent[]> {
    this.assertAccepting()
    assertPrincipalContext(principal)
    const records = await this.repository.list(principal)
    return Object.freeze(records.filter(record => record.state === 'ready').map(summary))
  }

  async withAgent<T>(
    principal: PrincipalContext,
    id: AgentId,
    use: (runtime: TenantAgentRuntime) => Promise<T>,
  ): Promise<T> {
    this.assertAccepting()
    assertPrincipalContext(principal)
    if (typeof use !== 'function') throw new TypeError('Agent callback must be a function')
    const parsed = parseAgentId(id)
    return this.serial(parsed, async () => {
      const record = await this.readyRecord(principal, parsed)
      const live = await this.ensureLive(principal, record)
      if (live.invalidated || live.secret.signal.aborted) throw new CapabilityUnavailableError('Agent capabilities were revoked.')
      const scope = controlledRuntime(live.handle.runtime, () => !live.invalidated && !live.secret.signal.aborted)
      live.scopes.add(scope)
      try {
        return await use(scope.runtime)
      } finally {
        scope.invalidate()
        live.scopes.delete(scope)
      }
    })
  }

  async delete(principal: PrincipalContext, id: AgentId): Promise<void> {
    this.assertAccepting()
    assertPrincipalContext(principal)
    const parsed = parseAgentId(id)
    // Start scoped authorization without yielding, then reserve the deletion
    // barrier synchronously so a later withAgent() cannot overtake it. Only an
    // authorized delete may revoke the currently live runtime.
    const authorized = this.readyRecord(principal, parsed)
    void authorized.then(() => {
      const live = this.live.get(parsed)
      if (live !== undefined) this.invalidateLive(live, 'Agent deleted')
    }, () => undefined)
    return this.serial(parsed, async () => {
      await authorized
      const record = await this.readyRecord(principal, parsed)
      const deleted = await this.repository.transition(principal, parsed, record.revision, {
        from: 'ready',
        to: 'deleted',
        at: new Date().toISOString(),
      })
      if (deleted === undefined) throw new AgentNotFoundError()
      await this.disposeLive(parsed)
    })
  }

  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.accepting = false
    for (const entry of this.live.values()) this.invalidateLive(entry, 'multi-tenant service disposed')
    this.closing = (async () => {
      await Promise.allSettled([...this.tails.values()])
      const results = await Promise.allSettled([...this.live.keys()].map(id => this.disposeLive(id)))
      const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
      if (errors.length > 0) throw new AggregateError(errors, 'multi-tenant Agent teardown failed')
    })()
    return this.closing
  }

  private get repository(): TenantAgentRepository {
    return this.requireService<TenantAgentRepository>('tenantAgentRepository')
  }

  private get mcp(): TenantMcpProvider {
    return this.requireService<TenantMcpProvider>('tenantMcp')
  }

  private get secrets(): SecretProvider {
    return this.requireService<SecretProvider>('multiTenantSecrets')
  }

  private get partitions(): RuntimePartitionProvider {
    return this.requireService<RuntimePartitionProvider>('runtimePartitions')
  }

  private requireService<T extends object>(key: string): T {
    const service = this.ctx.get(key)
    if (typeof service !== 'object' || service === null) {
      throw new CapabilityUnavailableError(`Required plugin service "${key}" is unavailable.`)
    }
    return service as T
  }

  private assertAccepting(): void {
    if (!this.accepting) throw new ServiceClosedError()
  }

  private serial<T>(id: AgentId, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(id) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(operation)
    const tail = run.then(() => undefined, () => undefined)
    this.tails.set(id, tail)
    return run.finally(() => {
      if (this.tails.get(id) === tail) this.tails.delete(id)
    })
  }

  private async readyRecord(principal: PrincipalContext, id: AgentId): Promise<TenantAgentRecord> {
    const record = await this.repository.get(principal, id)
    if (record === undefined || record.state !== 'ready') throw new AgentNotFoundError()
    return record
  }

  private async prepareCapabilities(principal: PrincipalContext, id: AgentId): Promise<PreparedCapabilities> {
    let snapshot: TenantMcpSnapshot
    try {
      snapshot = normalizeTenantMcpSnapshot(await this.mcp.load(principal))
    } catch (error) {
      if (error instanceof CapabilityUnavailableError) throw error
      throw new CapabilityUnavailableError('Tenant MCP configuration is unavailable.', { cause: error })
    }
    const names = requiredSecretNames(snapshot)
    let secret: SecretLease
    try {
      secret = names.length === 0 ? emptySecretLease() : await this.secrets.acquire(principal, names)
    } catch (error) {
      if (error instanceof CapabilityUnavailableError) throw error
      throw new CapabilityUnavailableError('Required Agent secrets are unavailable.', { cause: error })
    }
    let partition: RuntimePartitionLease | undefined
    try {
      secret.signal.throwIfAborted()
      partition = await this.partitions.acquire({
        principal,
        agentId: id,
        requiredIsolation: this.minimumIsolation,
        signal: secret.signal,
      })
      if (!meets(partition.isolation, this.minimumIsolation)) throw new IsolationUnavailableError()
      return {
        snapshot,
        secret,
        partition,
        capabilityRevision: capabilityRevision(snapshot, secret, partition.isolation),
      }
    } catch (error) {
      const cleanup: Array<() => void | PromiseLike<void>> = []
      if (partition !== undefined) cleanup.push(() => partition!.dispose())
      cleanup.push(() => secret.dispose())
      await settleDisposers(cleanup, 'capability preparation cleanup failed').catch(() => undefined)
      if (error instanceof CapabilityUnavailableError || error instanceof IsolationUnavailableError) throw error
      throw new CapabilityUnavailableError('A runtime partition is unavailable.', { cause: error })
    }
  }

  private async ensureLive(principal: PrincipalContext, record: TenantAgentRecord): Promise<LiveAgent> {
    const prepared = await this.prepareCapabilities(principal, record.id)
    const current = this.live.get(record.id)
    if (current !== undefined && !current.invalidated
      && !current.secret.signal.aborted
      && current.capabilityRevision === prepared.capabilityRevision) {
      await settleDisposers([
        () => prepared.partition.dispose(),
        () => prepared.secret.dispose(),
      ], 'unused capability lease cleanup failed')
      return current
    }
    if (current !== undefined) await this.disposeLive(record.id)
    let handle: DshRuntimeAgentHandle | undefined
    try {
      handle = await prepared.partition.driver.resume({
        sessionId: record.sessionId,
        mcpServers: resolveMcpServers(prepared.snapshot, prepared.secret),
        signal: prepared.secret.signal,
      })
      prepared.secret.signal.throwIfAborted()
      const updated = await this.repository.transition(principal, record.id, record.revision, {
        from: 'ready',
        to: 'ready',
        capabilityRevision: prepared.capabilityRevision,
        mcpServers: prepared.snapshot.servers.map(server => server.serverName),
        at: new Date().toISOString(),
      })
      if (updated === undefined) throw new AgentNotFoundError()
      return this.installLive(record.id, handle, prepared)
    } catch (error) {
      const cleanup: Array<() => void | PromiseLike<void>> = [
        () => prepared.partition.dispose(),
        () => prepared.secret.dispose(),
      ]
      if (handle !== undefined) cleanup.unshift(() => handle!.dispose())
      await settleDisposers(cleanup, 'failed Agent resume cleanup failed').catch(() => undefined)
      if (error instanceof AgentNotFoundError || error instanceof CapabilityUnavailableError) throw error
      if (prepared.secret.signal.aborted) throw new CapabilityUnavailableError('Agent capabilities were revoked.')
      throw new AgentProvisioningError({ cause: error })
    }
  }

  private installLive(
    id: AgentId,
    handle: DshRuntimeAgentHandle,
    prepared: PreparedCapabilities,
  ): LiveAgent {
    const entry: LiveAgent = {
      handle,
      secret: prepared.secret,
      partition: prepared.partition,
      capabilityRevision: prepared.capabilityRevision,
      scopes: new Set(),
      invalidated: false,
      detachRevocation() {},
    }
    const revoked = (): void => {
      this.invalidateLive(entry, 'secret lease revoked')
      void this.serial(id, async () => {
        if (this.live.get(id) === entry) await this.disposeLive(id)
      }).catch(() => undefined)
    }
    prepared.secret.signal.addEventListener('abort', revoked, { once: true })
    entry.detachRevocation = () => prepared.secret.signal.removeEventListener('abort', revoked)
    this.live.set(id, entry)
    if (prepared.secret.signal.aborted) revoked()
    return entry
  }

  private invalidateLive(entry: LiveAgent, reason: string): void {
    if (entry.invalidated) return
    entry.invalidated = true
    for (const scope of entry.scopes) scope.invalidate()
    entry.scopes.clear()
    entry.handle.runtime.cancel(reason)
  }

  private async disposeLive(id: AgentId): Promise<void> {
    const entry = this.live.get(id)
    if (entry === undefined) return
    this.live.delete(id)
    entry.detachRevocation()
    this.invalidateLive(entry, 'multi-tenant runtime released')
    await settleDisposers([
      () => entry.handle.dispose(),
      () => entry.partition.dispose(),
      () => entry.secret.dispose(),
    ], 'Agent runtime cleanup failed')
  }
}

export default MultiTenantService
