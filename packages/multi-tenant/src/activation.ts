/** Internal operation ownership for one live runtime generation. */
import { CapabilityUnavailableError } from './errors.ts'

export class ActivationOperations {
  readonly controller = new AbortController()
  private readonly pending = new Map<AbortController, Promise<unknown>>()

  run<T>(request: AbortSignal | undefined, use: (signal: AbortSignal) => T | PromiseLike<T>): Promise<T> {
    this.controller.signal.throwIfAborted()
    request?.throwIfAborted()
    const operation = new AbortController()
    const signal = AbortSignal.any([this.controller.signal, operation.signal, ...(request ? [request] : [])])
    // Register before invoking a provider that can synchronously trigger teardown.
    const deferred = Promise.withResolvers<T>()
    this.pending.set(operation, deferred.promise)
    try { deferred.resolve(use(signal)) } catch (error) { deferred.reject(error) }
    return deferred.promise.finally(() => this.pending.delete(operation))
  }

  cancel(reason: string): void {
    for (const operation of this.pending.keys()) operation.abort(new CapabilityUnavailableError(reason))
  }

  invalidate(reason: string): void {
    this.controller.abort(new CapabilityUnavailableError(reason))
  }

  async drain(): Promise<void> { await Promise.allSettled([...this.pending.values()]) }
}

/** Activity waits can be abandoned without owning or disposing the Agent itself. */
export function abortableWait<T>(value: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void value.catch(() => undefined); return Promise.reject(signal.reason) }
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason)
    signal.addEventListener('abort', aborted, { once: true })
    void value.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted))
  })
}
