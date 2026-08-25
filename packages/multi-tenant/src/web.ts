import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import {
  ProductExperienceError,
  productExperienceError,
  toProductDiagnostic,
} from './diagnostics.ts'
import type { McpSaaSRuntime } from './product.ts'

const DEFAULT_BASE_PATH = '/_dsh-multi-tenant'
const MAX_JSON_BODY_BYTES = 64 * 1024

type WebRoute = {
  readonly kind: 'exact' | 'prefix'
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

interface WebServerLike {
  register(route: WebRoute): () => void
}

interface ContextWithWebServer extends Context {
  readonly webServer: WebServerLike
}

export type TrustedWebSubjectResolver<TrustedSubject> = (
  request: IncomingMessage,
) => TrustedSubject | undefined | PromiseLike<TrustedSubject | undefined>

export interface McpSaaSWebBridgeOptions<TrustedSubject> {
  /**
   * Authenticate the request using product-owned logic and return a trusted
   * subject. JWT verification, cookie/session lookup, OIDC, etc. stay here.
   */
  readonly authenticate: TrustedWebSubjectResolver<TrustedSubject>
  /** Named-route prefix mounted into the existing DSH WebServer. */
  readonly basePath?: string
  /** Serve the small identity/admission panel at basePath. Defaults to true. */
  readonly controlPage?: boolean
}

export interface McpSaaSWebBridge {
  readonly basePath: string
  dispose(): void
}

function assertBasePath(value: string): void {
  if (!value.startsWith('/') || value === '/' || value.endsWith('/') || value.includes('?') || value.includes('#')) {
    throw new TypeError('web bridge basePath must be an absolute pathname without trailing slash')
  }
}

/** Extract a Bearer token from transport headers only; this does not validate it. */
export function readBearerToken(headers: IncomingHttpHeaders): string | undefined {
  const value = headers.authorization
  if (typeof value !== 'string') return undefined
  const match = /^Bearer[ \t]+(.+)$/i.exec(value)
  const token = match?.[1]?.trim()
  return token === undefined || token.length === 0 ? undefined : token
}

/** Extract one Cookie value from transport headers only; this does not authenticate it. */
export function readCookie(headers: IncomingHttpHeaders, name: string): string | undefined {
  if (typeof name !== 'string' || name.length === 0 || /[=;\s]/.test(name)) {
    throw new TypeError('cookie name must be a non-empty token')
  }
  const raw = headers.cookie
  if (typeof raw !== 'string') return undefined
  for (const part of raw.split(';')) {
    const index = part.indexOf('=')
    if (index < 0 || part.slice(0, index).trim() !== name) continue
    const value = part.slice(index + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return undefined
    }
  }
  return undefined
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

function writeHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
  })
  res.end(html)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let received = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    received += buffer.byteLength
    if (received > MAX_JSON_BODY_BYTES) throw new TypeError('request body is too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

function sessionIdFromBody(body: Record<string, unknown>): string {
  const sessionId = body.sessionId
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId !== sessionId.trim()) {
    throw new TypeError('sessionId must be a non-empty trimmed string')
  }
  return sessionId
}

function statusFor(error: ProductExperienceError): number {
  if (error.code === 'SESSION_ACCESS_DENIED' || error.code === 'SESSION_OWNERSHIP_CONFLICT') return 403
  if (error.stage === 'identity') return 401
  if (error.stage === 'tenant-mcp-config' || error.stage === 'principal-credential') return 503
  return 502
}

async function requireSubject<TrustedSubject>(
  req: IncomingMessage,
  authenticate: TrustedWebSubjectResolver<TrustedSubject>,
): Promise<TrustedSubject> {
  let subject: TrustedSubject | undefined
  try {
    subject = await authenticate(req)
  } catch (error) {
    throw productExperienceError(
      'IDENTITY_RESOLUTION_FAILED',
      'identity',
      'The product could not authenticate this request.',
      error,
    )
  }
  if (subject === undefined) {
    throw productExperienceError(
      'IDENTITY_RESOLUTION_FAILED',
      'identity',
      'Authentication is required.',
    )
  }
  return subject
}

function controlPage(basePath: string): string {
  const identityPath = `${basePath}/identity`
  const createPath = `${basePath}/agents/create`
  const resumePath = `${basePath}/agents/resume`
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-multi-tenant product bridge</title>
<style>body{font:14px system-ui;max-width:760px;margin:40px auto;padding:0 18px}code,pre,input{font-family:ui-monospace,monospace}button,input{padding:8px;margin:4px 4px 4px 0}pre{background:#f5f5f5;padding:14px;overflow:auto}</style></head>
<body><h1>dsh-multi-tenant</h1><p>This is the product identity / Agent admission surface mounted beside the existing DSH Web app. It is not a replacement chat UI.</p>
<p><button id="identity">Who am I?</button></p>
<p><input id="session" value="demo-session-1" aria-label="Session id"><button id="create">Create Agent</button><button id="resume">Resume Agent</button></p>
<pre id="out">Ready.</pre>
<script>
const out=document.getElementById('out');const session=document.getElementById('session');
async function show(url, init){try{const r=await fetch(url,init);const text=await r.text();let value;try{value=JSON.parse(text)}catch{value=text}out.textContent=JSON.stringify({status:r.status,body:value},null,2)}catch(e){out.textContent=String(e)}}
document.getElementById('identity').onclick=()=>show(${JSON.stringify(identityPath)});
for(const [id,url] of [['create',${JSON.stringify(createPath)}],['resume',${JSON.stringify(resumePath)}]]) document.getElementById(id).onclick=()=>show(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:session.value})});
</script></body></html>`
}

/**
 * Mount the product identity / Agent admission surface into DSH's existing
 * `ctx.webServer` named-route registry. No second HTTP server, router, DI
 * container or chat frontend is introduced.
 *
 * The pinned DSH Web `/api` RPC carrier does not expose a request-auth Context
 * to downstream business services. This bridge therefore owns product-aware
 * identity and create/resume admission only; callers must not claim that all
 * stock DSH Web RPC calls are tenant-authorized by this adapter.
 */
export function mountMcpSaaSWebBridge<TrustedSubject>(
  ctx: Context,
  runtime: McpSaaSRuntime<TrustedSubject>,
  options: McpSaaSWebBridgeOptions<TrustedSubject>,
): McpSaaSWebBridge {
  if (typeof options?.authenticate !== 'function') throw new TypeError('web authenticate callback must be a function')
  const basePath = options.basePath ?? DEFAULT_BASE_PATH
  assertBasePath(basePath)
  const webServer = (ctx as ContextWithWebServer).webServer
  if (webServer === undefined || typeof webServer.register !== 'function') {
    throw new Error('DSH ctx.webServer is required to mount the product Web bridge')
  }

  const handle = async (
    req: IncomingMessage,
    res: ServerResponse,
    action: 'identity' | 'create' | 'resume',
  ): Promise<void> => {
    try {
      const subject = await requireSubject(req, options.authenticate)
      const principal = await runtime.resolve(subject)
      if (action === 'identity') {
        if (req.method !== 'GET') {
          writeJson(res, 405, { error: 'method-not-allowed' })
          return
        }
        writeJson(res, 200, { principal: principal.identity })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { error: 'method-not-allowed' })
        return
      }
      const body = await readJson(req)
      const sessionId = sessionIdFromBody(body)
      const agent = action === 'create'
        ? await principal.create({ sessionId })
        : await principal.resume({ sessionId })
      writeJson(res, 200, {
        principal: principal.identity,
        sessionId: agent.sessionId,
        agentId: agent.agent.id,
        mcp: agent.servers.map(server => ({
          serverName: server.serverName,
          runtimeServerName: server.runtimeServerName,
          toolPrefix: server.toolPrefix,
        })),
      })
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof TypeError) {
        writeJson(res, 400, { error: 'bad-request', message: error.message })
        return
      }
      const wrapped = error instanceof ProductExperienceError
        ? error
        : productExperienceError('MCP_SETUP_FAILED', 'mcp-setup', 'The product request could not be completed.', error)
      writeJson(res, statusFor(wrapped), { error: toProductDiagnostic(wrapped) })
    }
  }

  const routes: WebRoute[] = [
    ...(options.controlPage === false ? [] : [{
      kind: 'exact' as const,
      path: basePath,
      handler: (req: IncomingMessage, res: ServerResponse): void => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          writeJson(res, 405, { error: 'method-not-allowed' })
          return
        }
        const html = controlPage(basePath)
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(html), 'cache-control': 'no-store' })
          res.end()
          return
        }
        writeHtml(res, html)
      },
    }]),
    { kind: 'exact', path: `${basePath}/identity`, handler: (req, res) => handle(req, res, 'identity') },
    { kind: 'exact', path: `${basePath}/agents/create`, handler: (req, res) => handle(req, res, 'create') },
    { kind: 'exact', path: `${basePath}/agents/resume`, handler: (req, res) => handle(req, res, 'resume') },
  ]

  const disposers: Array<() => void> = []
  try {
    for (const route of routes) disposers.push(webServer.register(route))
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }

  let disposed = false
  return Object.freeze({
    basePath,
    dispose() {
      if (disposed) return
      disposed = true
      for (const dispose of disposers.reverse()) dispose()
    },
  })
}
