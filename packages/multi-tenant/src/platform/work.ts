import type { Server } from 'node:http'
import type { ListenOptions } from 'node:net'

/** Aborting a response is not proof that its authentication or runtime operation settled. */
export class PendingWork {
  private readonly pending = new Set<Promise<unknown>>()

  track<T>(operation: Promise<T>): Promise<T> {
    this.pending.add(operation)
    const settled = () => { this.pending.delete(operation) }
    void operation.then(settled, settled)
    return operation
  }

  async drain(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending])
  }
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error && !('code' in error && error.code === 'ERR_SERVER_NOT_RUNNING')) reject(error)
      else resolve()
    })
    server.closeAllConnections()
  })
}

export function listenServer(server: Server, options: ListenOptions & { signal: AbortSignal }): Promise<void> {
  options.signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off('error', failed)
      server.off('close', closed)
      server.off('listening', listening)
    }
    const failed = (cause: Error) => {
      cleanup()
      reject(cause)
    }
    const closed = () => {
      cleanup()
      reject(new Error('Listen cancelled'))
    }
    const listening = () => {
      cleanup()
      resolve()
    }
    server.once('error', failed)
    server.once('close', closed)
    server.once('listening', listening)
    server.listen(options)
  })
}

export async function settleCleanup(operations: Promise<unknown>[]): Promise<void> {
  const outcomes = await Promise.allSettled(operations)
  const failures = outcomes.flatMap(outcome => outcome.status === 'rejected' ? [outcome.reason as unknown] : [])
  if (failures.length) throw new AggregateError(failures, 'Platform cleanup failed')
}
