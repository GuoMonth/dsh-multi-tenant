/** Authenticated product CRUD mounted into DSH's existing WebServer. */

import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import {
  AgentNotFoundError,
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
import { assertPrincipalContext, parseAgentId, type CreateAgentOptions, type PrincipalContext } from './types.ts'

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

export interface MultiTenantWebOptions {
  readonly principalProvider: PrincipalProvider<IncomingMessage>
  readonly basePath?: string
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

function createOptions(body: Record<string, unknown>): CreateAgentOptions {
  for (const forbidden of ['tenantId', 'principalId', 'userId', 'sessionId', 'agentId']) {
    if (Object.hasOwn(body, forbidden)) throw new ValidationError(`${forbidden} is not accepted at this boundary`)
  }
  for (const key of Object.keys(body)) {
    if (key !== 'agentOptions' && key !== 'meta') throw new ValidationError(`unknown create option ${key}`)
  }
  const options: {
    agentOptions?: NonNullable<CreateAgentOptions['agentOptions']>
    meta?: NonNullable<CreateAgentOptions['meta']>
  } = {}
  if (body.agentOptions !== undefined) {
    options.agentOptions = body.agentOptions as NonNullable<CreateAgentOptions['agentOptions']>
  }
  if (body.meta !== undefined) options.meta = body.meta as NonNullable<CreateAgentOptions['meta']>
  return options
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
  if (error instanceof AgentNotFoundError) {
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
      const agent = await service.create(principal, createOptions(await readJson(req)))
      writeJson(res, 201, { agent })
      return
    }
    writeJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } })
  })

  const member = async (req: IncomingMessage, res: ServerResponse): Promise<void> => respond(res, async () => {
    const principal = await requirePrincipal(req, options.principalProvider)
    const pathname = new URL(req.url ?? '', 'http://localhost').pathname
    const encoded = pathname.slice(`${agentsPath}/`.length)
    if (encoded.length === 0 || encoded.includes('/')) throw new AgentNotFoundError()
    let decoded: string
    try {
      decoded = decodeURIComponent(encoded)
    } catch {
      throw new AgentNotFoundError()
    }
    const id = parseAgentId(decoded)
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
