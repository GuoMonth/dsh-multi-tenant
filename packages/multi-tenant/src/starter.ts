import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { InMemoryPrincipalCredentials } from './credentials.ts'
import {
  ProductExperienceError,
  productExperienceError,
  toProductDiagnostic,
} from './diagnostics.ts'
import type { McpAgentHandle, McpAgentLike } from './mcp.ts'
import { createMcpSaaSRuntime, type McpSaaSRuntime } from './product.ts'
import { mountMcpSaaSWebBridge, readCookie } from './web.ts'

export const name = 'multi-tenant-starter'

const BASE_PATH = '/_dsh-multi-tenant'
const COOKIE_NAME = 'dsh_mt_demo'
const MAX_JSON_BODY_BYTES = 64 * 1024

export interface Config {
  /** Opt-in only. The normal package bundle keeps the starter dormant. */
  readonly enabled?: boolean
}

interface DemoSubject {
  readonly tenant: string
  readonly user: string
}

interface DemoIdentity extends DemoSubject {
  readonly key: string
  readonly label: string
}

const DEMO_IDENTITIES: readonly DemoIdentity[] = Object.freeze([
  Object.freeze({ key: 'acme-alice', tenant: 'acme', user: 'alice', label: 'Acme / Alice' }),
  Object.freeze({ key: 'acme-bob', tenant: 'acme', user: 'bob', label: 'Acme / Bob' }),
  Object.freeze({ key: 'globex-alice', tenant: 'globex', user: 'alice', label: 'Globex / Alice' }),
])

const IDENTITY_BY_KEY = new Map(DEMO_IDENTITIES.map(identity => [identity.key, identity] as const))

type WebRoute = {
  readonly kind: 'exact' | 'prefix'
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

interface WebServerLike {
  register(route: WebRoute): () => void
}

interface ToolRuntimeLike {
  get(name: string, scope?: unknown): unknown
  execute(input: {
    readonly callId: string
    readonly name: string
    readonly arguments: Record<string, unknown>
    readonly signal: AbortSignal
    readonly agent: unknown
  }): Promise<unknown>
}

interface ContextWithStarterServices extends Context {
  readonly webServer: WebServerLike
}

function requireWebServer(ctx: Context): WebServerLike {
  const value = (ctx as ContextWithStarterServices).webServer
  if (value === undefined || typeof value.register !== 'function') {
    throw new Error('dsh-multi-tenant starter requires the DSH Web profile (ctx.webServer is unavailable)')
  }
  return value
}

function requireTools(ctx: Context): ToolRuntimeLike {
  const value = ctx.get('tools') as Partial<ToolRuntimeLike> | undefined
  if (typeof value !== 'object' || value === null || typeof value.get !== 'function' || typeof value.execute !== 'function') {
    throw new Error('dsh-multi-tenant starter requires the DSH ToolRuntime service')
  }
  return value as ToolRuntimeLike
}

function writeJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    'cache-control': 'no-store',
    ...headers,
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
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('request body must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

function requireSessionId(body: Record<string, unknown>): string {
  const value = body.sessionId
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError('sessionId must be a non-empty trimmed string')
  }
  return value
}

function cookieFor(identityKey: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(identityKey)}; Path=${BASE_PATH}; HttpOnly; SameSite=Strict`
}

function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=${BASE_PATH}; HttpOnly; SameSite=Strict; Max-Age=0`
}

function demoSubject(req: IncomingMessage): DemoSubject | undefined {
  const key = readCookie(req.headers, COOKIE_NAME)
  if (key === undefined) return undefined
  const identity = IDENTITY_BY_KEY.get(key)
  if (identity === undefined) return undefined
  return { tenant: identity.tenant, user: identity.user }
}

function demoCredential(tenantId: string, userId: string): string {
  return `starter-secret:${tenantId}/${userId}`
}

/**
 * Tiny dependency-free MCP stdio server used only by the opt-in starter.
 * The credential enters the child process but the tool returns only whether it
 * matched the expected Principal identity; the raw value is never returned.
 */
function demoMcpProgram(): string {
  return String.raw`
let buffer = ''
const send = value => process.stdout.write(JSON.stringify(value) + '\n')
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })
const tool = {
  name: 'who_am_i',
  description: 'Return the demo Tenant and Principal and prove that a Principal credential reached this MCP process without revealing the credential.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
}
async function handle(message) {
  if (message === null || typeof message !== 'object' || typeof message.method !== 'string') return
  if (message.id === undefined) return
  if (message.method === 'initialize') {
    const requested = message.params?.protocolVersion
    reply(message.id, {
      protocolVersion: typeof requested === 'string' ? requested : '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'dsh-multi-tenant-starter', version: '1.0.0' },
    })
    return
  }
  if (message.method === 'ping') return reply(message.id, {})
  if (message.method === 'tools/list') return reply(message.id, { tools: [tool] })
  if (message.method === 'tools/call') {
    if (message.params?.name !== 'who_am_i') return fail(message.id, -32602, 'unknown tool')
    const tenant = process.env.DEMO_TENANT_ID ?? null
    const user = process.env.DEMO_USER_ID ?? null
    const expected = typeof tenant === 'string' && typeof user === 'string'
      ? 'starter-secret:' + tenant + '/' + user
      : undefined
    const payload = {
      tenant,
      user,
      credentialAccepted: expected !== undefined && process.env.DEMO_CREDENTIAL === expected,
    }
    reply(message.id, { content: [{ type: 'text', text: JSON.stringify(payload) }] })
    return
  }
  fail(message.id, -32601, 'method not found')
}
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buffer += chunk
  for (;;) {
    const newline = buffer.indexOf('\n')
    if (newline < 0) break
    const line = buffer.slice(0, newline).replace(/\r$/, '')
    buffer = buffer.slice(newline + 1)
    if (line.trim() === '') continue
    try { void handle(JSON.parse(line)) } catch { /* malformed input is ignored by this demo server */ }
  }
})
`
}

function starterPage(): string {
  const identities = JSON.stringify(DEMO_IDENTITIES.map(({ key, label }) => ({ key, label })))
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-multi-tenant First Product Experience</title>
<style>
body{font:14px system-ui;max-width:900px;margin:36px auto;padding:0 20px;line-height:1.5}code,pre,input,select{font-family:ui-monospace,monospace}button,input,select{padding:8px;margin:4px 6px 4px 0}pre{background:#f5f5f5;padding:14px;overflow:auto;border-radius:8px}.row{margin:14px 0}.note{padding:10px 12px;background:#fff8dc;border-radius:8px}
</style></head>
<body>
<h1>dsh-multi-tenant — First Product Experience</h1>
<p>This small panel is mounted <strong>beside the real DSH Web app</strong>. It demonstrates product identity, Principal-bound Agent admission, real MCP Tool discovery/execution, and Session ownership. It is not a replacement chat frontend.</p>
<div class="note">Demo authentication is an HttpOnly local cookie only. Real products replace this seam with their already-verified JWT, server session, or <code>req.user</code>.</div>
<div class="row"><label>Principal <select id="identity"></select></label><button id="login">Login / switch user</button><button id="who">Who am I?</button></div>
<div class="row"><label>Session <input id="session" size="30"></label><button id="create">Create Agent</button><button id="tool">Create + call real MCP Tool</button><button id="resume">Resume Agent</button></div>
<div class="row"><a href="/">Open the existing DSH Web app</a></div>
<pre id="out">Choose a Principal, then login.</pre>
<script>
const identities=${identities};const select=document.getElementById('identity');for(const row of identities){const o=document.createElement('option');o.value=row.key;o.textContent=row.label;select.appendChild(o)}
const out=document.getElementById('out');const session=document.getElementById('session');session.value='starter-'+Date.now();
async function request(url,init){try{const r=await fetch(url,init);const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}out.textContent=JSON.stringify({status:r.status,body},null,2);return {r,body}}catch(error){out.textContent=String(error)}}
const json=value=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
document.getElementById('login').onclick=()=>request(${JSON.stringify(`${BASE_PATH}/login`)},json({identity:select.value}));
document.getElementById('who').onclick=()=>request(${JSON.stringify(`${BASE_PATH}/identity`)});
document.getElementById('create').onclick=()=>request(${JSON.stringify(`${BASE_PATH}/agents/create`)},json({sessionId:session.value}));
document.getElementById('resume').onclick=()=>request(${JSON.stringify(`${BASE_PATH}/agents/resume`)},json({sessionId:session.value}));
document.getElementById('tool').onclick=()=>request(${JSON.stringify(`${BASE_PATH}/demo-tool`)},json({sessionId:session.value}));
</script></body></html>`
}

async function executeWhoAmI(
  ctx: Context,
  handle: McpAgentHandle<McpAgentLike>,
): Promise<unknown> {
  const server = handle.servers[0]
  if (server === undefined) {
    throw productExperienceError(
      'MCP_DISCOVERY_FAILED',
      'mcp-discovery',
      'The starter MCP server did not publish a runtime namespace.',
    )
  }
  const name = `${server.toolPrefix}who_am_i`
  const tools = requireTools(ctx)
  if (tools.get(name, handle.agent) === undefined) {
    throw productExperienceError(
      'MCP_DISCOVERY_FAILED',
      'mcp-discovery',
      'The starter MCP Tool was not discovered for this Agent.',
    )
  }
  return tools.execute({
    callId: `starter-${handle.sessionId}`,
    name,
    arguments: {},
    signal: new AbortController().signal,
    agent: handle.agent,
  })
}

function safeFailure(res: ServerResponse, error: unknown): void {
  if (error instanceof SyntaxError || error instanceof TypeError) {
    writeJson(res, 400, { error: 'bad-request', message: error.message })
    return
  }
  const wrapped = error instanceof ProductExperienceError
    ? error
    : productExperienceError('MCP_SETUP_FAILED', 'mcp-setup', 'The starter request could not be completed.', error)
  const status = wrapped.stage === 'identity' ? 401
    : wrapped.stage === 'session-ownership' ? 403
      : 502
  writeJson(res, status, { error: toProductDiagnostic(wrapped) })
}

/**
 * Opt-in runnable MVP mounted into the real DSH Web profile.
 *
 * Activate with `DSH_MULTI_TENANT_STARTER=1 dsh web`. The default bundle row
 * loads this module dormant, so installing dsh-multi-tenant into a production
 * profile does not publish demo identities or routes unless explicitly enabled.
 */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  if (config.enabled !== true) return
  const webServer = requireWebServer(ctx)

  const runtime: McpSaaSRuntime<DemoSubject> = await createMcpSaaSRuntime(ctx, {
    identity(subject) {
      return { tenantId: subject.tenant, userId: subject.user }
    },
    mcp: {
      definitionKey: 'first-product-experience-v1',
      load({ tenantId }) {
        return {
          servers: [{
            transport: 'stdio',
            serverName: 'starter',
            command: process.execPath,
            args: ['--input-type=module', '--eval', demoMcpProgram()],
            env: { DEMO_TENANT_ID: tenantId },
            credentialEnv: {
              DEMO_USER_ID: { credential: 'demoUserId' },
              DEMO_CREDENTIAL: { credential: 'demoCredential' },
            },
            reconnect: { enabled: false },
            toolCallTimeoutMs: 5_000,
          }],
        }
      },
    },
    credentials: {
      definitionKey: 'first-product-experience-v1',
      create({ principal }) {
        return new InMemoryPrincipalCredentials({
          demoUserId: principal.userId,
          demoCredential: demoCredential(principal.tenantId, principal.userId),
        })
      },
    },
  })

  const bridge = mountMcpSaaSWebBridge(ctx, runtime, {
    basePath: BASE_PATH,
    controlPage: false,
    authenticate: request => demoSubject(request),
  })

  const routes: WebRoute[] = [
    {
      kind: 'exact',
      path: BASE_PATH,
      handler(req, res) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          writeJson(res, 405, { error: 'method-not-allowed' })
          return
        }
        const html = starterPage()
        if (req.method === 'HEAD') {
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'content-length': Buffer.byteLength(html),
            'cache-control': 'no-store',
          })
          res.end()
          return
        }
        writeHtml(res, html)
      },
    },
    {
      kind: 'exact',
      path: `${BASE_PATH}/login`,
      async handler(req, res) {
        try {
          if (req.method !== 'POST') return writeJson(res, 405, { error: 'method-not-allowed' })
          const body = await readJson(req)
          const key = body.identity
          if (typeof key !== 'string' || !IDENTITY_BY_KEY.has(key)) throw new TypeError('identity is not a starter Principal')
          const identity = IDENTITY_BY_KEY.get(key)!
          writeJson(res, 200, {
            principal: { tenantId: identity.tenant, userId: identity.user },
          }, { 'set-cookie': cookieFor(key) })
        } catch (error) {
          safeFailure(res, error)
        }
      },
    },
    {
      kind: 'exact',
      path: `${BASE_PATH}/logout`,
      handler(req, res) {
        if (req.method !== 'POST') return writeJson(res, 405, { error: 'method-not-allowed' })
        writeJson(res, 200, { ok: true }, { 'set-cookie': clearCookie() })
      },
    },
    {
      kind: 'exact',
      path: `${BASE_PATH}/demo-tool`,
      async handler(req, res) {
        try {
          if (req.method !== 'POST') return writeJson(res, 405, { error: 'method-not-allowed' })
          const subject = demoSubject(req)
          if (subject === undefined) {
            throw productExperienceError('IDENTITY_RESOLUTION_FAILED', 'identity', 'Authentication is required.')
          }
          const body = await readJson(req)
          const sessionId = requireSessionId(body)
          const handle = await runtime.create(subject, { sessionId })
          let result: unknown
          try {
            result = await executeWhoAmI(ctx, handle)
          } finally {
            // This route is a one-shot proof, not the product facade's lifetime
            // contract. Release the live Agent after the real MCP call so the
            // persisted Session can be resumed under the same Principal without
            // colliding with an already-published DSH Agent of the same id.
            await handle.dispose()
          }
          writeJson(res, 200, {
            principal: { tenantId: subject.tenant, userId: subject.user },
            sessionId,
            tool: 'who_am_i',
            result,
          })
        } catch (error) {
          safeFailure(res, error)
        }
      },
    },
  ]

  const disposers: Array<() => void> = []
  try {
    for (const route of routes) disposers.push(webServer.register(route))
  } catch (error) {
    bridge.dispose()
    await runtime.dispose()
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }

  ctx.effect(() => async () => {
    for (const dispose of disposers.reverse()) dispose()
    bridge.dispose()
    await runtime.dispose()
  }, 'dsh-multi-tenant starter')
}
