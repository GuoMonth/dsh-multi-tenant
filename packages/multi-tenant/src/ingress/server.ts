import { request as httpRequest, createServer } from 'node:http'
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { DomainOwner } from '../domain/repository.ts'
import type { RuntimeAdmission } from '../runtime/provider.ts'
import type { DomainAuthenticator } from './authentication.ts'

export interface DomainIngressOptions {
  readonly authenticator: DomainAuthenticator
  readonly runtime: { ensure(owner: DomainOwner): Promise<RuntimeAdmission> }
  /** Trusted mapping; a domain's origin cannot be chosen by request headers. */
  readonly originFor: (owner: DomainOwner) => string
  readonly maxConnections?: number
}

const hop = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])
function headers(input: IncomingMessage['headers']): OutgoingHttpHeaders {
  const remove = new Set([...hop, ...(input.connection ?? '').split(',').map(value => value.trim().toLowerCase())])
  const result: OutgoingHttpHeaders = {}
  for (const [key, value] of Object.entries(input)) {
    if (!remove.has(key) && value !== undefined) result[key] = value
  }
  return result
}

class Rejection extends Error { constructor(readonly status: number) { super('Domain admission rejected') } }

async function until<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let listener: () => void = () => {}
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      listener = () => reject(signal.reason)
      signal.addEventListener('abort', listener, { once: true })
      if (signal.aborted) listener()
    })])
  } finally { signal.removeEventListener('abort', listener) }
}

/** Every route and upgrade passes the same admission. Native payloads remain opaque. */
export function createDomainIngress(options: DomainIngressOptions) {
  const active = new Set<AbortController>()
  let closing = false
  let closeTask: Promise<void> | undefined
  const maximum = options.maxConnections ?? 1_024
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new TypeError('Invalid connection limit')

  async function admit(request: IncomingMessage, abort: AbortController, websocket: boolean) {
    const authSignal = AbortSignal.any([abort.signal, AbortSignal.timeout(5_000)])
    const identity = await until(options.authenticator.authenticate(request, authSignal), authSignal)
    if (!identity || identity.signal.aborted) throw new Rejection(401)
    const external = new URL(options.originFor(identity.owner))
    if (!['http:', 'https:'].includes(external.protocol) || external.username || external.password || external.pathname !== '/' || external.search || external.hash) {
      throw new Error('Invalid configured domain origin')
    }
    if (request.headers.host !== external.host || request.headers['sec-fetch-site'] === 'cross-site'
      || (request.headers.origin !== undefined && request.headers.origin !== external.origin)
      || ((websocket || !['GET', 'HEAD'].includes(request.method ?? '')) && request.headers.origin !== external.origin)) {
      throw new Rejection(403)
    }
    const admission = await until(options.runtime.ensure(identity.owner), AbortSignal.any([abort.signal, identity.signal]))
    const signal = AbortSignal.any([abort.signal, identity.signal, admission.signal])
    signal.throwIfAborted()
    const cookie = admission.authentication?.cookie
    if (!cookie || /[\r\n]/.test(cookie)) throw new Error('Native runtime authentication missing')
    const internal = new URL(admission.endpoint)
    const forwarded = headers(request.headers)
    for (const key of Object.keys(forwarded)) {
      if (['cookie', 'authorization', 'host', 'origin', 'forwarded'].includes(key) || key.startsWith('x-forwarded-') || key.startsWith('x-dsh-')) delete forwarded[key]
    }
    forwarded.host = internal.host
    forwarded.origin = internal.origin
    forwarded.cookie = cookie
    if (websocket) { forwarded.connection = 'Upgrade'; forwarded.upgrade = 'websocket' }
    return { internal, forwarded, signal, socketPath: admission.socketPath }
  }

  function begin(request: IncomingMessage): AbortController {
    if (closing || active.size >= maximum) throw new Rejection(503)
    if (!request.url?.startsWith('/') || request.url.startsWith('//') || /[\r\n]/.test(request.url)) throw new Rejection(400)
    const abort = new AbortController()
    active.add(abort)
    return abort
  }

  async function forward(request: IncomingMessage, response: ServerResponse) {
    let abort: AbortController | undefined
    try {
      abort = begin(request)
      abort.signal.addEventListener('abort', () => response.destroy(), { once: true })
      const release = () => { abort!.abort(); active.delete(abort!) }
      response.once('close', release)
      const { internal, forwarded, signal, socketPath } = await admit(request, abort, false)
      const upstream = httpRequest(internal, { method: request.method, path: request.url, headers: forwarded, signal,
        ...(socketPath === undefined ? {} : { socketPath }),
      })
      const cancelled = () => response.destroy()
      signal.addEventListener('abort', cancelled, { once: true })
      response.once('close', () => { signal.removeEventListener('abort', cancelled); upstream.destroy() })
      upstream.once('response', received => {
        const outgoing = headers(received.headers)
        delete outgoing['set-cookie']
        outgoing['cache-control'] = 'no-store'
        // Add an intersecting policy; never discard native script/style policies.
        const csp = outgoing['content-security-policy']
        outgoing['content-security-policy'] = [
          ...(csp === undefined ? [] : Array.isArray(csp) ? csp : [String(csp)]),
          "frame-ancestors 'self'",
        ].join(', ')
        outgoing['x-frame-options'] ??= 'SAMEORIGIN'
        response.writeHead(received.statusCode ?? 502, outgoing)
        received.once('error', () => response.destroy())
        received.pipe(response)
      })
      upstream.once('error', () => {
        if (response.headersSent) response.destroy()
        else { response.writeHead(502, { 'cache-control': 'no-store' }); response.end() }
      })
      request.once('error', () => upstream.destroy())
      request.pipe(upstream)
    } catch (error) {
      if (abort) active.delete(abort)
      if (!response.destroyed) { response.writeHead(error instanceof Rejection ? error.status : 503, { 'cache-control': 'no-store' }); response.end() }
    }
  }

  async function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    let abort: AbortController | undefined
    try {
      abort = begin(request)
      abort.signal.addEventListener('abort', () => socket.destroy(), { once: true })
      socket.on('error', () => socket.destroy())
      socket.once('close', () => { abort!.abort(); active.delete(abort!) })
      const { internal, forwarded, signal, socketPath } = await admit(request, abort, true)
      const upstream = httpRequest(internal, { method: 'GET', path: request.url, headers: forwarded, signal,
        ...(socketPath === undefined ? {} : { socketPath }),
      })
      const cancelled = () => socket.destroy()
      signal.addEventListener('abort', cancelled, { once: true })
      socket.once('close', () => { signal.removeEventListener('abort', cancelled); upstream.destroy() })
      upstream.once('upgrade', (response, target, upstreamHead) => {
        const outgoing = headers(response.headers)
        delete outgoing['set-cookie']
        outgoing.connection = 'Upgrade'
        outgoing.upgrade = 'websocket'
        const lines = Object.entries(outgoing).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map(item => `${key}: ${String(item)}`))
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join('\r\n')}\r\n\r\n`)
        target.on('error', () => socket.destroy())
        target.once('close', () => socket.destroy())
        socket.once('close', () => target.destroy())
        if (upstreamHead.length) socket.write(upstreamHead)
        if (head.length) target.write(head)
        socket.pipe(target).pipe(socket)
      })
      upstream.once('response', response => { response.resume(); socket.end(`HTTP/1.1 ${response.statusCode ?? 502} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`) })
      upstream.once('error', () => socket.destroy())
      upstream.end()
    } catch (error) {
      if (abort) active.delete(abort)
      if (!socket.destroyed) socket.end(`HTTP/1.1 ${error instanceof Rejection ? error.status : 503} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
    }
  }

  const server = createServer((request, response) => { void forward(request, response) })
  server.on('upgrade', (request, socket, head) => { void upgrade(request, socket, head) })
  return {
    server,
    close: async () => {
      if (closeTask) return closeTask
      closing = true
      for (const abort of active) abort.abort()
      closeTask = new Promise<void>((resolve, reject) => server.close(error => {
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error)
        else resolve()
      })).catch(error => { closeTask = undefined; throw error })
      return closeTask
    },
  }
}
