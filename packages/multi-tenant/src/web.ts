/** Authenticated product CRUD mounted into DSH's existing WebServer. */

import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { once } from 'node:events'
import type { Context } from '@deepseek-ai/cordis'
import {
  AgentNotFoundError,
  DeliveryNotFoundError,
  AgentProvisioningError,
  AuthenticationRequiredError,
  CapabilityUnavailableError,
  IsolationUnavailableError,
  MultiTenantError,
  ServiceClosedError,
  ValidationError,
} from './errors.ts'
import type { PrincipalProvider } from './protocols.ts'
import type { MultiTenantService } from './service.ts'
import {
  assertPrincipalContext,
  parseAgentId,
  validateCreateAgentOptions,
  type CreateAgentOptions,
  type PrincipalContext,
} from './types.ts'

const DEFAULT_BASE_PATH = '/_dsh-multi-tenant'
const MAX_BODY_BYTES = 64 * 1024

interface WebRoute {
  readonly kind: 'exact' | 'prefix'
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

interface WebServerLike {
  register(route: WebRoute): () => void
}

export interface CreateAgentRequest {
  readonly profile?: string
}

export type AgentProfileResolver = (
  principal: PrincipalContext,
  profile: string,
) => CreateAgentOptions | undefined | PromiseLike<CreateAgentOptions | undefined>

export interface MultiTenantWebOptions {
  readonly principalProvider: PrincipalProvider<IncomingMessage>
  readonly basePath?: string
  readonly resolveAgentProfile?: AgentProfileResolver
}

export interface MultiTenantWebHandle {
  readonly basePath: string
  dispose(): void
}

function webServer(ctx: Context): WebServerLike {
  const service = ctx.get('webServer')
  if (typeof service !== 'object' || service === null || typeof Reflect.get(service, 'register') !== 'function') {
    throw new Error('DSH ctx.webServer is required')
  }
  return service as WebServerLike
}

function basePath(value: string | undefined): string {
  const path = value ?? DEFAULT_BASE_PATH
  if (!path.startsWith('/') || path === '/' || path.endsWith('/') || path.includes('?') || path.includes('#')) {
    throw new TypeError('basePath must be an absolute pathname without a trailing slash')
  }
  return path
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    'cache-control': 'no-store',
  })
  res.end(json)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let length = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += buffer.byteLength
    if (length > MAX_BODY_BYTES) throw new ValidationError('request body is too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

async function createOptions(
  principal: PrincipalContext,
  body: Record<string, unknown>,
  resolver: AgentProfileResolver | undefined,
): Promise<CreateAgentOptions | undefined> {
  for (const key of Reflect.ownKeys(body)) {
    if (key !== 'profile') throw new ValidationError('request body contains an unknown field')
  }
  if (!Object.hasOwn(body, 'profile')) return undefined
  const profile = body.profile
  if (typeof profile !== 'string' || profile.length === 0 || profile !== profile.trim()) {
    throw new ValidationError('profile must be a non-empty trimmed string')
  }
  if (resolver === undefined) throw new ValidationError('Agent profiles are not configured')
  let resolved: CreateAgentOptions | undefined
  try {
    resolved = await resolver(principal, profile)
  } catch (error) {
    throw new CapabilityUnavailableError('Agent profile resolution is unavailable.', { cause: error })
  }
  if (resolved === undefined) throw new ValidationError('unknown Agent profile')
  try {
    return validateCreateAgentOptions(resolved)
  } catch (error) {
    throw new CapabilityUnavailableError('Agent profile resolution is unavailable.', { cause: error })
  }
}

async function requirePrincipal(
  request: IncomingMessage,
  provider: PrincipalProvider<IncomingMessage>,
): Promise<PrincipalContext> {
  let principal: PrincipalContext | undefined
  try {
    principal = await provider.authenticate(request)
    if (principal !== undefined) assertPrincipalContext(principal)
  } catch (error) {
    throw new AuthenticationRequiredError({ cause: error })
  }
  if (principal === undefined) throw new AuthenticationRequiredError()
  return principal
}

function responseError(error: unknown): { readonly status: number; readonly code: string; readonly message: string } {
  if (error instanceof SyntaxError || error instanceof ValidationError) {
    return { status: 400, code: 'INVALID_INPUT', message: 'Invalid request.' }
  }
  if (error instanceof AuthenticationRequiredError) {
    return { status: 401, code: error.code, message: error.message }
  }
  if (error instanceof AgentNotFoundError || error instanceof DeliveryNotFoundError) {
    return { status: 404, code: error.code, message: error.message }
  }
  if (error instanceof CapabilityUnavailableError || error instanceof IsolationUnavailableError || error instanceof ServiceClosedError) {
    return { status: 503, code: error.code, message: 'A required service capability is unavailable.' }
  }
  if (error instanceof AgentProvisioningError) {
    return { status: 502, code: error.code, message: error.message }
  }
  return {
    status: 502,
    code: error instanceof MultiTenantError ? error.code : 'AGENT_OPERATION_FAILED',
    message: 'Agent operation failed.',
  }
}

async function respond(res: ServerResponse, operation: () => Promise<void>): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (res.destroyed || res.writableEnded) return
    if (res.headersSent) { res.destroy(); return }
    const result = responseError(error)
    writeJson(res, result.status, { error: { code: result.code, message: result.message } })
  }
}

export function mountMultiTenantWeb(
  ctx: Context,
  service: MultiTenantService,
  options: MultiTenantWebOptions,
): MultiTenantWebHandle {
  if (typeof options?.principalProvider?.authenticate !== 'function') {
    throw new TypeError('principalProvider.authenticate is required')
  }
  const base = basePath(options.basePath)
  const agentsPath = `${base}/agents`
  const server = webServer(ctx)

  const collection = async (req: IncomingMessage, res: ServerResponse): Promise<void> => respond(res, async () => {
    const principal = await requirePrincipal(req, options.principalProvider)
    if (req.method === 'GET') {
      writeJson(res, 200, { agents: await service.list(principal) })
      return
    }
    if (req.method === 'POST') {
      const optionsForAgent = await createOptions(principal, await readJson(req), options.resolveAgentProfile)
      const agent = optionsForAgent === undefined
        ? await service.create(principal)
        : await service.create(principal, optionsForAgent)
      writeJson(res, 201, { agent })
      return
    }
    writeJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } })
  })

  const member = async (req: IncomingMessage, res: ServerResponse): Promise<void> => respond(res, async () => {
    const principal = await requirePrincipal(req, options.principalProvider)
    const pathname = new URL(req.url ?? '', 'http://localhost').pathname
    const encoded = pathname.slice(`${agentsPath}/`.length)
    if (encoded.length === 0) throw new AgentNotFoundError()
    const parts = encoded.split('/')
    if (parts.length > 5) throw new AgentNotFoundError()
    let decoded: string
    try {
      decoded = decodeURIComponent(parts[0]!)
    } catch {
      throw new AgentNotFoundError()
    }
    const id = parseAgentId(decoded)
    let action = parts[1]
    let childRef: string | undefined
    let fileRef: string | undefined
    if (action === 'children' && parts.length >= 3) {
      try { childRef = decodeURIComponent(parts[2]!) } catch { throw new AgentNotFoundError() }
      action = parts[3] ?? 'history'
      if (parts.length === 5) {
        if (action !== 'deliveries') throw new AgentNotFoundError()
        try { fileRef = decodeURIComponent(parts[4]!) } catch { throw new DeliveryNotFoundError() }
      }
    } else if (parts.length > 2) {
      if (parts.length !== 3 || action !== 'deliveries') throw new AgentNotFoundError()
      try { fileRef = decodeURIComponent(parts[2]!) } catch { throw new DeliveryNotFoundError() }
    }
    const target = childRef === undefined ? {} : { childRef }
    if (action === 'deliveries') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { writeJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }); return }
      const params = new URL(req.url!, 'http://localhost').searchParams
      if ([...params.keys()].some(key => key !== 'download') || (params.has('download') && params.get('download') !== '1')) throw new ValidationError('unknown delivery field')
      const controller = new AbortController()
      const disconnected = () => controller.abort()
      res.once('close', disconnected)
      try {
        if (fileRef === undefined) {
          if (req.method === 'HEAD') { writeJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }); return }
          writeJson(res, 200, { deliveries: await service.deliveries(principal, id, { ...target, signal: controller.signal }) })
        } else {
          const file = await service.file(principal, id, fileRef, { ...target, signal: controller.signal })
          const revoked = () => res.destroy()
          file.signal.addEventListener('abort', revoked, { once: true })
          try {
            file.signal.throwIfAborted()
            const disposition = params.has('download') || file.contentType === 'application/octet-stream' ? 'attachment' : 'inline'
            const encodedName = encodeURIComponent(file.name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
            res.writeHead(200, {
              'content-type': file.contentType, 'content-length': file.size,
              'content-disposition': `${disposition}; filename="download"; filename*=UTF-8''${encodedName}`,
              'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
              'content-security-policy': "sandbox; default-src 'none'; frame-ancestors 'self'",
            })
            if (req.method !== 'HEAD') for await (const chunk of file.content) {
              if (!res.write(chunk)) await once(res, 'drain', { signal: file.signal })
            }
            res.end()
          } finally { file.signal.removeEventListener('abort', revoked); await file.dispose() }
        }
      } finally { controller.abort(); res.off('close', disconnected) }
      return
    }
    if (action === 'children') {
      if (req.method !== 'GET') { writeJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }); return }
      writeJson(res, 200, { children: await service.children(principal, id, target) })
      return
    }
    if (action === 'history' || action === 'events') {
      if (req.method !== 'GET') { writeJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }); return }
      const params = new URL(req.url!, 'http://localhost').searchParams
      if ([...params.keys()].some(key => !['before', 'limit'].includes(key)) || (action === 'events' && params.size)) throw new ValidationError('unknown read field')
      const controller = new AbortController()
      const disconnected = () => controller.abort()
      res.once('close', disconnected)
      try {
        if (action === 'history') {
          const page = await service.read(principal, id, { ...target, signal: controller.signal,
            ...(params.has('before') ? { before: params.get('before')! } : {}),
            ...(params.has('limit') ? { limit: Number(params.get('limit')) } : {}),
          })
          writeJson(res, 200, page)
        } else {
          const observation = await service.observe(principal, id, { ...target, signal: controller.signal })
          try {
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
            for await (const frame of observation) {
              if (!res.write(`event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)) await once(res, 'drain', { signal: controller.signal })
            }
            res.end()
          } finally { await observation.dispose() }
        }
      } finally { controller.abort(); res.off('close', disconnected) }
      return
    }
    if (action !== undefined) {
      if (action !== 'messages' && action !== 'cancel') throw new AgentNotFoundError()
      if (req.method !== 'POST') { writeJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }); return }
      const body = await readJson(req)
      const allowed = action === 'messages' ? ['text', 'delivery'] : ['reason']
      if (Object.keys(body).some(key => !allowed.includes(key))) throw new ValidationError('unknown command field')
      if (action === 'messages') {
        if (typeof body.text !== 'string' || (body.delivery !== undefined && body.delivery !== 'queue' && body.delivery !== 'steer')) throw new ValidationError('invalid message')
        const controller = new AbortController()
        const disconnected = () => { if (!res.writableEnded) controller.abort() }
        res.once('close', disconnected)
        try {
          const receipt = await service.send(principal, id, body.text, { ...target, ...(body.delivery === undefined ? {} : { delivery: body.delivery }), signal: controller.signal })
          writeJson(res, 202, receipt)
        } finally { res.off('close', disconnected) }
      } else {
        if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 1024)) throw new ValidationError('invalid cancellation reason')
        writeJson(res, 200, await service.cancel(principal, id, body.reason as string | undefined, target))
      }
      return
    }
    if (req.method === 'GET') {
      writeJson(res, 200, { agent: await service.get(principal, id) })
      return
    }
    if (req.method === 'DELETE') {
      await service.delete(principal, id)
      res.writeHead(204, { 'cache-control': 'no-store' })
      res.end()
      return
    }
    writeJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } })
  })

  const disposers: Array<() => void> = []
  try {
    disposers.push(server.register({ kind: 'exact', path: agentsPath, handler: collection }))
    disposers.push(server.register({ kind: 'prefix', path: agentsPath, handler: member }))
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }

  let disposed = false
  return Object.freeze({
    basePath: base,
    dispose() {
      if (disposed) return
      disposed = true
      for (const dispose of disposers.reverse()) dispose()
    },
  })
}

export function readBearerToken(headers: IncomingHttpHeaders): string | undefined {
  const value = headers.authorization
  if (typeof value !== 'string') return undefined
  const token = /^Bearer[ \t]+(.+)$/i.exec(value)?.[1]?.trim()
  return token === undefined || token.length === 0 ? undefined : token
}

export function readCookie(headers: IncomingHttpHeaders, name: string): string | undefined {
  if (typeof name !== 'string' || name.length === 0 || /[=;\s]/.test(name)) throw new TypeError('invalid cookie name')
  if (typeof headers.cookie !== 'string') return undefined
  for (const part of headers.cookie.split(';')) {
    const index = part.indexOf('=')
    if (index < 0 || part.slice(0, index).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}
