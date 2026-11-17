import { z } from 'zod'
import { PendingWork, closeServer, settleCleanup, listenServer } from './work.ts'
import { environmentId } from './identity.ts'
import { identities } from '@dsh/environment-connector-internal'
import { diagnostic } from './errors.ts'
import { createServer, type ServerResponse } from 'node:http'
import { chmod, lstat } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'

import type { createEnvironmentControl } from './control.ts'

/** Local administrator capability is possession of this socket's private filesystem path. */
export async function listenAdmin(
  path: string,
  control: ReturnType<typeof createEnvironmentControl>,
  shutdown: AbortSignal,
) {
  if (!isAbsolute(path) || Buffer.byteLength(path) > 100)
    throw new Error('Invalid admin socket path')
  const directory = await lstat(dirname(path))
  if (
    !directory.isDirectory() ||
    directory.uid !== process.getuid?.() ||
    (directory.mode & 0o077) !== 0
  )
    throw new Error('Admin socket directory must be owned and private')
  try {
    await lstat(path)
    throw new Error('Admin socket path already exists')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  shutdown.throwIfAborted()
  const work = new PendingWork()
  let closing = false
  let closingPromise: Promise<void> | undefined
  const pending = new Set<AbortController>()
  const send = (response: ServerResponse, status: number, value: unknown) => {
    if (!response.destroyed) {
      response.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      })
      response.end(JSON.stringify(value))
    }
  }
  const server = createServer((request, response) => {
    const correlationId = randomUUID()
    if (closing || pending.size >= 32 || shutdown.aborted) {
      send(response, 503, { code: 'AdminUnavailable', correlationId })
      return
    }
    const match = /^\/(inspect|delete|stop|start)\/([A-Za-z0-9_-]{1,80})$/.exec(
      request.url ?? '',
    )
    if (
      !match ||
      request.method !== (match[1] !== 'inspect' ? 'POST' : 'GET') ||
      request.headers['transfer-encoding'] ||
      Number(request.headers['content-length'] ?? 0) !== 0
    ) {
      send(response, 400, { code: 'InvalidAdminRequest', correlationId })
      return
    }
    const controller = new AbortController()
    pending.add(controller)
    response.once('close', () => { controller.abort() })
    const allocationKey = request.headers['x-allocation-key'],
      identity = request.headers['x-instance-identity']
    const expected =
      typeof allocationKey === 'string' && typeof identity === 'string'
        ? { allocationKey: identities.allocationKey(allocationKey), identity: identities.sandboxUID(identity) }
        : undefined
    void work.track(control
      .administer(
        environmentId(match[2]),
        z.enum(['inspect', 'delete', 'stop', 'start']).parse(match[1]),
        expected,
        {
          correlationId,
          signal: AbortSignal.any([
            controller.signal,
            shutdown,
            AbortSignal.timeout(15000),
          ]),
        },
      )
      .then((result) => { send(response, 200, result) })
      .catch((error: unknown) => {
        const failure = diagnostic(error, correlationId)
        send(
          response,
          failure.code === 'AllocationUnresolved' ||
            failure.code === 'StaleInstance' ||
            failure.code === 'RecordMissing'
            ? 409
            : 503,
          failure,
        )
      })
      .finally(() => pending.delete(controller)))
  })
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  const close = () => {
    if (closingPromise) return closingPromise
    closing = true
    for (const controller of pending) controller.abort()
    closingPromise = settleCleanup([closeServer(server), work.drain()])
    return closingPromise
  }
  try {
    await listenServer(server, { path, signal: shutdown })
    await chmod(path, 0o600)
    shutdown.throwIfAborted()
  } catch (error) {
    await close()
    throw error
  }
  return { close }
}
