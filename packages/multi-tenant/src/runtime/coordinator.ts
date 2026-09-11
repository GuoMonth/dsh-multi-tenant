import type { DomainDesiredState, DomainOwner, DomainRecord, DomainRepository } from '../domain/repository.ts'
import type { RuntimeAdmission, RuntimeHandle, RuntimeProvider } from './provider.ts'

interface Entry {
  readonly record: DomainRecord
  readonly abort: AbortController
  task: Promise<RuntimeAdmission>
  handle?: RuntimeHandle
  disposal?: Promise<void>
  released: boolean
}

function bounded<T>(operation: Promise<T>, milliseconds: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  let abort: () => void
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Runtime operation timed out')), milliseconds)
    abort = () => reject(signal!.reason)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    operation.then(resolve, reject)
  }).finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', abort) })
}

/** Single active coordinator. Callers are trusted control-plane consumers, not browsers. */
export class DomainRuntimeCoordinator {
  private readonly entries = new Map<string, Entry>()
  private readonly recoveries = new Map<string, Promise<void>>()
  private closing = false
  private closeTask: Promise<void> | undefined

  constructor(
    private readonly repository: DomainRepository,
    private readonly provider: RuntimeProvider,
    private readonly version: string,
    private readonly startupTimeoutMs = 30_000,
    private readonly stopTimeoutMs = 10_000,
  ) {
    for (const value of [startupTimeoutMs, stopTimeoutMs]) {
      if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) throw new TypeError('Invalid runtime timeout')
    }
  }

  async ensure(owner: DomainOwner): Promise<RuntimeAdmission> {
    if (this.closing) throw new Error('Coordinator is closing')
    const current = this.repository.resolve(owner)
    if (this.recoveries.has(current.id)) throw new Error('Domain runtime is recovering')
    if (current.desired !== 'enabled') throw new Error('Domain is not enabled')
    const existing = this.entries.get(current.id)
    if (existing) {
      if (existing.abort.signal.aborted) throw new Error('Domain is stopping or awaiting cleanup')
      return existing.task
    }
    const record = this.repository.begin(current.id)
    const entry: Entry = { record, abort: new AbortController(), task: undefined!, released: false }
    this.entries.set(record.id, entry)
    entry.task = Promise.resolve().then(() => this.start(entry))
    return entry.task
  }

  private async start(entry: Entry): Promise<RuntimeAdmission> {
    const { record, abort } = entry
    try {
      abort.signal.throwIfAborted()
      entry.handle = this.provider.acquire({ domainId: record.id, generation: record.generation, version: this.version }, abort.signal)
      void entry.handle.exited.then(() => {
        if (!abort.signal.aborted) {
          abort.abort(new Error('Runtime exited'))
          void this.dispose(entry, true).catch(() => { /* Failed ownership remains retained for stop retry. */ })
        }
      })
      const ready = await bounded(entry.handle.ready, this.startupTimeoutMs, abort.signal)
      abort.signal.throwIfAborted()
      if (ready.domainId !== record.id || ready.generation !== record.generation || ready.version !== this.version) {
        throw new Error('Runtime readiness identity mismatch')
      }
      const endpoint = new URL(ready.endpoint)
      if (endpoint.protocol !== 'http:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
        throw new Error('Invalid internal runtime endpoint')
      }
      const current = this.repository.get(record.id)
      if (current.revision !== record.revision || current.desired !== 'enabled') throw new Error('Stale runtime policy')
      this.repository.ready(record.id, record.generation)
      return Object.freeze({ ...ready, revision: record.revision, signal: abort.signal })
    } catch (error) {
      abort.abort(error)
      try { await this.dispose(entry, true) }
      catch (cleanup) { throw new AggregateError([error, cleanup], 'Runtime startup and cleanup failed') }
      throw error
    }
  }

  private dispose(entry: Entry, failed: boolean): Promise<void> {
    if (entry.disposal) return entry.disposal
    entry.abort.abort(new Error('Runtime admission invalidated'))
    entry.disposal = Promise.resolve().then(async () => {
      const errors: unknown[] = []
      try { this.repository.stopping(entry.record.id, entry.record.generation) } catch (error) { errors.push(error) }
      if (!entry.released) {
        try {
          if (entry.handle) await bounded(entry.handle.stop(), this.stopTimeoutMs)
          entry.released = true
        } catch (error) { errors.push(error) }
      }
      try { this.repository.finish(entry.record.id, entry.record.generation, entry.released, failed || errors.length > 0) }
      catch (error) { errors.push(error) }
      if (errors.length) throw new AggregateError(errors, 'Runtime disposal failed')
      if (this.entries.get(entry.record.id) === entry) this.entries.delete(entry.record.id)
    }).catch(error => {
      delete entry.disposal
      throw error
    })
    return entry.disposal
  }

  async stop(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) {
      if (this.repository.get(id).unresolved) throw new Error('Domain requires verified runtime recovery')
      return
    }
    entry.abort.abort(new Error('Runtime stopped'))
    // Startup observes cancellation and owns cleanup; never release before acquire settles.
    await entry.task.catch(() => {})
    await this.dispose(entry, false)
  }

  async setDesired(id: string, desired: DomainDesiredState): Promise<void> {
    if (this.closing) throw new Error('Coordinator is closing')
    const before = this.repository.get(id)
    const after = this.repository.setDesired(id, desired)
    if (before.revision !== after.revision || desired !== 'enabled') await this.stop(id)
  }

  recover(id: string): Promise<void> {
    if (this.closing || this.entries.has(id)) return Promise.reject(new Error('Cannot recover an owned or closing runtime'))
    const existing = this.recoveries.get(id)
    if (existing) return existing
    const record = this.repository.get(id)
    if (!record.unresolved) return Promise.resolve()
    const recover = this.provider.recover?.bind(this.provider)
    if (!recover) return Promise.reject(new Error('Provider cannot verify runtime recovery'))
    const task = Promise.resolve().then(async () => {
      await recover({ domainId: id, generation: record.generation, version: this.version })
      this.repository.finish(id, record.generation, true, true)
    }).finally(() => this.recoveries.delete(id))
    this.recoveries.set(id, task)
    return task
  }

  /** A failed close keeps the directory lock and cleanup handles; retry close after repair. */
  close(): Promise<void> {
    if (this.closeTask) return this.closeTask
    this.closing = true
    for (const entry of this.entries.values()) entry.abort.abort(new Error('Coordinator is closing'))
    this.closeTask = Promise.resolve().then(async () => {
      const results = await Promise.allSettled([...this.recoveries.values(), ...[...this.entries.keys()].map(id => this.stop(id))])
      const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
      if (errors.length) throw new AggregateError(errors, 'Coordinator shutdown failed')
      this.repository.close()
    }).catch(error => { this.closeTask = undefined; throw error })
    return this.closeTask
  }
}
