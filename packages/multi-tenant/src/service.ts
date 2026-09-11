/** Multi-tenant authority kernel and owned DSH Agent lifecycle. */

import { ActivationOperations, abortableWait } from './activation.ts'
import { historyPage, observeLease, readBounds, type ReadOptions, type HistoryPage, type AgentObservation, type SessionReadLease } from './observation.ts'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { ValidationError } from './errors.ts'
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
import {
  normalizeAcquired,
  normalizeRuntimeHandle,
  normalizeRuntimePartition,
  normalizeSecretLease,
} from './provider-results.ts'
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
  readonly signal: AbortSignal
  readonly capabilityRevision: string
}

interface LiveAgent {
  readonly handle: DshRuntimeAgentHandle
  readonly secret: SecretLease
  readonly partition: RuntimePartitionLease
  readonly capabilityRevision: string
  readonly operations: ActivationOperations
  readonly generation: number
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
  private readonly lifecycle = new AbortController()
  private readonly live = new Map<AgentId, LiveAgent>()
  private readonly tails = new Map<AgentId, Promise<void>>()
  private generation = 0
  private readonly cutoffs = new Map<AgentId, AbortController>()
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
        prepared.signal.throwIfAborted()
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
        handle = await normalizeAcquired(await prepared.partition.driver.create({
          sessionId,
          mcpServers: resolved,
          signal: prepared.signal,
          ...normalized,
        }), normalizeRuntimeHandle)
        prepared.signal.throwIfAborted()
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
        if (this.lifecycle.signal.aborted) throw new ServiceClosedError()
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

  /** Admit a human message without waiting for a model turn or a durability checkpoint. */
  async send(principal: PrincipalContext, id: AgentId, text: string, options: { delivery?: 'queue' | 'steer'; signal?: AbortSignal } = {}): Promise<{ accepted: true }> {
    if (typeof text !== 'string' || !text.trim() || text.length > 65536) throw new ValidationError('message must contain text within 65536 characters')
    const delivery = options.delivery ?? 'queue'
    if (delivery !== 'queue' && delivery !== 'steer') throw new ValidationError('invalid delivery')
    const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
    return this.operate(principal, id, options.signal, runtime => {
      if (delivery === 'steer') runtime.steer(message)
      else runtime.followup(message)
      return { accepted: true as const }
    })
  }

  /** Cancel only a currently live generation; never activate a cold resource. */
  async cancel(principal: PrincipalContext, id: AgentId, reason = 'user stop'): Promise<{ status: 'cancelled' | 'inactive' }> {
    this.assertAccepting()
    assertPrincipalContext(principal)
    const parsed = parseAgentId(id)
    await this.readyRecord(principal, parsed)
    this.assertAccepting()
    const entry = this.live.get(parsed)
    if (!entry || entry.invalidated || entry.secret.signal.aborted) return { status: 'inactive' }
    entry.operations.cancel(reason)
    entry.handle.runtime.cancel(reason)
    return { status: 'cancelled' }
  }

  /** Wait for activity only. A cold resource is already idle. */
  async whenIdle(principal: PrincipalContext, id: AgentId, options: { signal?: AbortSignal } = {}): Promise<void> {
    this.assertAccepting()
    assertPrincipalContext(principal)
    const parsed = parseAgentId(id)
    await this.readyRecord(principal, parsed)
    this.assertAccepting()
    options.signal?.throwIfAborted()
    const entry = this.live.get(parsed)
    if (!entry || entry.invalidated) return
    await entry.operations.run(options.signal, signal => abortableWait(entry.handle.runtime.whenIdle(), signal))
  }

  /** Trusted host tool execution; not exposed as an arbitrary Web tool endpoint. */
  executeTool(principal: PrincipalContext, id: AgentId, name: string, args: unknown, options: { signal?: AbortSignal } = {}) {
    return this.operate(principal, id, options.signal, (runtime, signal) => runtime.executeTool(name, args, { signal }))
  }

  /** Trusted host context injection, using the native message/source vocabulary. */
  inject(principal: PrincipalContext, id: AgentId, message: UserMessage): Promise<void> {
    return this.operate(principal, id, undefined, runtime => runtime.inject(message))
  }

  private async operate<T>(principal: PrincipalContext, id: AgentId, signal: AbortSignal | undefined, use: (runtime: TenantAgentRuntime, signal: AbortSignal) => T | PromiseLike<T>): Promise<T> {
    this.assertAccepting()
    assertPrincipalContext(principal)
    const parsed = parseAgentId(id)
    signal?.throwIfAborted()
    const admitted = await this.serial(parsed, async () => {
      const record = await this.readyRecord(principal, parsed)
      const live = await this.ensureLive(principal, record)
      this.assertAccepting()
      this.cutoff(parsed).signal.throwIfAborted()
      if (live.invalidated || live.secret.signal.aborted) throw new CapabilityUnavailableError('Agent capabilities were revoked.')
      // Do not await this promise inside the lifecycle queue.
      return { operation: live.operations.run(signal, active => use(live.handle.runtime, active)) }
    })
    return admitted.operation
  }

  private cutoff(id: AgentId): AbortController {
    let controller = this.cutoffs.get(id)
    if (!controller) { controller = new AbortController(); this.cutoffs.set(id, controller) }
    return controller
  }

  async read(principal: PrincipalContext, id: AgentId, options: ReadOptions = {}): Promise<HistoryPage> {
    readBounds(id, options)
    const { lease, signal } = await this.openReader(principal, id, options.signal)
    try {
      const snapshot = await lease.read()
      signal.throwIfAborted()
      lease.signal?.throwIfAborted()
      return historyPage(id, snapshot, options)
    } finally { await lease.dispose() }
  }

  async observe(principal: PrincipalContext, id: AgentId, options: { signal?: AbortSignal } = {}): Promise<AgentObservation> {
    const { lease, signal } = await this.openReader(principal, id, options.signal)
    return observeLease(id, lease, signal)
  }

  private async openReader(principal: PrincipalContext, id: AgentId, request?: AbortSignal): Promise<{ lease: SessionReadLease; signal: AbortSignal }> {
    this.assertAccepting()
    const parsed = parseAgentId(id)
    const record = await this.readyRecord(principal, parsed)
    const signal = AbortSignal.any([this.lifecycle.signal, this.cutoff(parsed).signal, ...(request ? [request] : [])])
    signal.throwIfAborted()
    const lease = await this.partitions.openRead({ principal, agentId: parsed, sessionId: record.sessionId, signal })
    if (signal.aborted) { await lease.dispose(); signal.throwIfAborted() }
    return { lease, signal }
  }

  async delete(principal: PrincipalContext, id: AgentId): Promise<void> {
    this.assertAccepting()
    assertPrincipalContext(principal)
    const parsed = parseAgentId(id)
    // Start scoped authorization without yielding, then reserve the deletion
    // barrier synchronously so a later command cannot overtake it. Only an
    // authorized delete may revoke the currently live runtime.
    const authorized = this.readyRecord(principal, parsed)
    void authorized.then(() => {
      this.cutoff(parsed).abort(new CapabilityUnavailableError('Agent deleted'))
      const live = this.live.get(parsed)
      if (live !== undefined) this.invalidateLive(live, 'Agent deleted')
    }, () => undefined)
    return this.serial(parsed, async () => {
      await authorized
      const record = await this.readyRecord(principal, parsed)
      try {
        const deleted = await this.repository.transition(principal, parsed, record.revision, {
          from: 'ready', to: 'deleted', at: new Date().toISOString(),
        })
        if (deleted === undefined) throw new AgentNotFoundError()
      } finally {
        await this.disposeLive(parsed)
      }
    })
  }

  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.accepting = false
    this.lifecycle.abort(new ServiceClosedError())
    for (const entry of this.live.values()) this.invalidateLive(entry, 'multi-tenant service disposed')
    this.closing = (async () => {
      await Promise.allSettled([...this.tails.values()])
      const results = await Promise.allSettled([...this.live.keys()].map(id => this.disposeLive(id)))
      const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
      this.cutoffs.clear()
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
    this.assertLifecycle()
    this.cutoff(id).signal.throwIfAborted()
    const lifecycle = AbortSignal.any([this.lifecycle.signal, this.cutoff(id).signal])
    let snapshot: TenantMcpSnapshot
    try {
      snapshot = normalizeTenantMcpSnapshot(await this.mcp.load(principal, lifecycle))
      this.assertLifecycle()
    } catch (error) {
      if (this.lifecycle.signal.aborted) throw new ServiceClosedError()
      if (error instanceof CapabilityUnavailableError) throw error
      throw new CapabilityUnavailableError('Tenant MCP configuration is unavailable.', { cause: error })
    }
    const names = requiredSecretNames(snapshot)
    let secret: SecretLease
    try {
      secret = names.length === 0
        ? normalizeSecretLease(emptySecretLease())
        : await normalizeAcquired(
          await this.secrets.acquire(principal, names, lifecycle),
          normalizeSecretLease,
        )
      // The acquired lease is owned by the cleanup block below, including late abort.
    } catch (error) {
      if (this.lifecycle.signal.aborted) throw new ServiceClosedError()
      if (error instanceof CapabilityUnavailableError) throw error
      throw new CapabilityUnavailableError('Required Agent secrets are unavailable.', { cause: error })
    }
    const signal = AbortSignal.any([lifecycle, secret.signal])
    let partition: RuntimePartitionLease | undefined
    try {
      signal.throwIfAborted()
      partition = await normalizeAcquired(
        await this.partitions.acquire({
          principal,
          agentId: id,
          requiredIsolation: this.minimumIsolation,
          signal,
        }),
        normalizeRuntimePartition,
      )
      signal.throwIfAborted()
      if (!meets(partition.isolation, this.minimumIsolation)) throw new IsolationUnavailableError()
      return {
        snapshot,
        secret,
        partition,
        signal,
        capabilityRevision: capabilityRevision(snapshot, secret, partition.isolation),
      }
    } catch (error) {
      const cleanup: Array<() => void | PromiseLike<void>> = []
      if (partition !== undefined) cleanup.push(() => partition!.dispose())
      cleanup.push(() => secret.dispose())
      await settleDisposers(cleanup, 'capability preparation cleanup failed').catch(() => undefined)
      if (this.lifecycle.signal.aborted) throw new ServiceClosedError()
      if (secret.signal.aborted) throw new CapabilityUnavailableError('Agent capabilities were revoked.')
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
      handle = await normalizeAcquired(await prepared.partition.driver.resume({
        sessionId: record.sessionId,
        mcpServers: resolveMcpServers(prepared.snapshot, prepared.secret),
        signal: prepared.signal,
      }), normalizeRuntimeHandle)
      prepared.signal.throwIfAborted()
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
      if (this.lifecycle.signal.aborted) throw new ServiceClosedError()
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
      operations: new ActivationOperations(),
      generation: ++this.generation,
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

  private assertLifecycle(): void {
    if (this.lifecycle.signal.aborted) throw new ServiceClosedError()
  }

  private invalidateLive(entry: LiveAgent, reason: string): void {
    if (entry.invalidated) return
    entry.invalidated = true
    entry.operations.invalidate(reason)
    entry.handle.runtime.cancel(reason)
  }

  private async disposeLive(id: AgentId): Promise<void> {
    const entry = this.live.get(id)
    if (entry === undefined) return
    this.live.delete(id)
    entry.detachRevocation()
    this.invalidateLive(entry, 'multi-tenant runtime released')
    await entry.operations.drain()
    await settleDisposers([
      () => entry.handle.dispose(),
      () => entry.partition.dispose(),
      () => entry.secret.dispose(),
    ], 'Agent runtime cleanup failed')
  }
}

export default MultiTenantService
