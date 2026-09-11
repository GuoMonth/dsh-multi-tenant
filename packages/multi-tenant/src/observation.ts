/** Product-safe views and bounded, disposable observations of native Session facts. */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { AgentId, PrincipalContext } from './types.ts'
import { CapabilityUnavailableError, ValidationError } from './errors.ts'

export interface SessionReadRequest {
  readonly principal: PrincipalContext
  readonly agentId: AgentId
  /** Trusted provider input, never taken directly from a product request. */
  readonly sessionId: string
  readonly signal: AbortSignal
}

export interface SessionReadSnapshot {
  readonly events: readonly SessionEvent[]
  readonly cursor: number
  readonly active: boolean
}

export interface SessionReadLease {
  /** Optional host authorization-revocation signal, independent of runtime Secrets. */
  readonly signal?: AbortSignal
  read(): Promise<SessionReadSnapshot>
  /** Install before the opening read. Text is transient and must not advance the durable cursor. */
  subscribe(changed: (transient?: { attempt: string; text: string; reset: boolean }) => void): () => void
  dispose(): void | PromiseLike<void>
}

export interface HistoryItem {
  readonly seq: number
  readonly kind: 'user' | 'assistant' | 'turn-start' | 'turn-end'
  readonly text?: string
}

export interface HistoryPage {
  readonly items: readonly HistoryItem[]
  readonly cursor: string
  readonly older?: string
  readonly active: boolean
}

export interface ReadOptions { readonly before?: string; readonly limit?: number; readonly signal?: AbortSignal }
export type ObservationFrame =
  | { readonly type: 'replace' | 'append'; readonly page: HistoryPage }
  | { readonly type: 'status'; readonly active: boolean }
  | { readonly type: 'transient'; readonly attempt: string; readonly text: string; readonly reset: boolean }

export interface AgentObservation extends AsyncIterable<ObservationFrame> { dispose(): Promise<void> }

function textContent(content: readonly unknown[]): string {
  return content.flatMap(part => {
    if (part && typeof part === 'object' && Reflect.get(part, 'type') === 'text' && typeof Reflect.get(part, 'text') === 'string') return [String(Reflect.get(part, 'text'))]
    return []
  }).join('')
}

export function historyItem(event: SessionEvent): HistoryItem | undefined {
  if (event.type === 'user/message') return { seq: event.seq, kind: 'user', text: textContent(event.data.content) }
  if (event.type === 'assistant/message') return { seq: event.seq, kind: 'assistant', text: textContent(event.data.message.content) }
  if (event.type === 'turn/start') return { seq: event.seq, kind: 'turn-start' }
  if (event.type === 'turn/end') return { seq: event.seq, kind: 'turn-end' }
  return undefined
}

export function readBounds(target: string, options: ReadOptions): { before: number; limit: number } {
  const limit = options.limit ?? 50
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new ValidationError('limit must be between 1 and 200')
  let before = Infinity
  if (options.before !== undefined) {
    const prefix = `${target}:`
    if (!options.before.startsWith(prefix) || !/^\d+$/.test(options.before.slice(prefix.length))) throw new ValidationError('cursor does not belong to this target')
    before = Number(options.before.slice(prefix.length))
    if (!Number.isSafeInteger(before)) throw new ValidationError('invalid cursor')
  }
  return { before, limit }
}

export function historyPage(target: string, snapshot: SessionReadSnapshot, options: ReadOptions = {}, after = -1): HistoryPage {
  const { before, limit } = readBounds(target, options)
  const all = snapshot.events.filter(event => event.seq < before && event.seq > after).flatMap(event => {
    const item = historyItem(event)
    return item ? [item] : []
  })
  const items = after < 0 ? all.slice(-limit) : all.slice(0, limit)
  const cursor = after < 0 || all.length <= limit ? snapshot.cursor : items.at(-1)!.seq
  return { items, cursor: `${target}:${cursor}`, active: snapshot.active,
    ...(after < 0 && all.length > limit ? { older: `${target}:${items[0]!.seq}` } : {}),
  }
}

/** Overflow terminates visibly; callers reconnect with a new baseline rather than silently losing history. */
export class ObservationQueue implements AgentObservation {
  private readonly frames: ObservationFrame[] = []
  private wake = Promise.withResolvers<void>()
  private ended = false
  private error: unknown
  private disposed?: Promise<void>
  constructor(private readonly cleanup: () => void | PromiseLike<void>) {}

  push(frame: ObservationFrame): void {
    if (this.ended) return
    if (this.frames.length >= 128) { this.fail(new CapabilityUnavailableError('Observation consumer is too slow; reopen the stream.')); return }
    this.frames.push(frame)
    this.wake.resolve()
  }

  fail(error: unknown): void { this.error = error; void this.dispose().catch(() => undefined) }

  dispose(): Promise<void> {
    if (!this.disposed) {
      this.ended = true
      this.frames.length = 0
      this.wake.resolve()
      this.disposed = Promise.resolve().then(this.cleanup)
    }
    return this.disposed
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<ObservationFrame> {
    try {
      while (!this.ended || this.frames.length) {
        const frame = this.frames.shift()
        if (frame) { yield frame; continue }
        this.wake = Promise.withResolvers<void>()
        await this.wake.promise
      }
      if (this.error) throw this.error
    } finally { await this.dispose() }
  }
}

export async function observeLease(target: string, lease: SessionReadLease, signal: AbortSignal): Promise<AgentObservation> {
  if (lease.signal) signal = AbortSignal.any([signal, lease.signal])
  let unsubscribe = () => {}
  const stopped = new AbortController()
  const queue = new ObservationQueue(async () => {
    stopped.abort()
    signal.removeEventListener('abort', abort)
    unsubscribe()
    await lease.dispose()
  })
  const abort = () => { queue.fail(signal.reason) }
  signal.addEventListener('abort', abort, { once: true })
  let dirty = false
  let pumping = false
  let opened = false
  let cursor = -1
  const pump = async () => {
    if (pumping || !opened || stopped.signal.aborted) return
    pumping = true
    try {
      while (dirty && !stopped.signal.aborted) {
        dirty = false
        const snapshot = await lease.read()
        signal.throwIfAborted()
        if (stopped.signal.aborted) break
        do {
          const page = historyPage(target, snapshot, { limit: 200 }, cursor)
          cursor = Number(page.cursor.slice(target.length + 1))
          if (page.items.length) queue.push({ type: 'append', page })
        } while (cursor < snapshot.cursor && !stopped.signal.aborted)
        queue.push({ type: 'status', active: snapshot.active })
      }
    } catch (error) { queue.fail(error) }
    finally { pumping = false }
  }
  try {
    signal.throwIfAborted()
    unsubscribe = lease.subscribe(transient => {
      if (transient !== undefined) { if (opened) queue.push({ type: 'transient', ...transient }); return }
      dirty = true
      void pump()
    })
    const snapshot = await lease.read()
    signal.throwIfAborted()
    cursor = snapshot.cursor
    queue.push({ type: 'replace', page: historyPage(target, snapshot) })
    opened = true
    void pump()
    return queue
  } catch (error) { await queue.dispose(); throw error }
}
