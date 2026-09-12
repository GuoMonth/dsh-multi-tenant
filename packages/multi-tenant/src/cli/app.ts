import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { once } from 'node:events'
import { SQLiteDomainRepository } from '../domain/sqlite.ts'
import { DomainRuntimeCoordinator } from '../runtime/coordinator.ts'
import { DesktopDockerRuntimeProvider } from '../runtime/providers/desktop-docker.ts'
import { MemoryDomainSessions } from '../ingress/authentication.ts'
import { createDomainIngress } from '../ingress/server.ts'
import type { RuntimeProvider } from '../runtime/provider.ts'

const token = () => randomBytes(32).toString('base64url')
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
async function body(request: IncomingMessage) {
  let value = ''
  for await (const chunk of request) { value += String(chunk); if (value.length > 4096) throw new Error('Request too large') }
  return value
}
function json(response: ServerResponse, status: number, value: unknown) { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(value)) }
function page(response: ServerResponse, content: string, script: string) {
  const nonce = token()
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` })
  response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DSH · Your local workbench</title>
<style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#f5f4f0;color:#172824;font:16px/1.65 system-ui,sans-serif}main{max-width:850px;margin:9vh auto;padding:32px}small{letter-spacing:.14em;color:#536961}h1{font-size:clamp(34px,6vw,56px);line-height:1.12;letter-spacing:-.05em;margin:24px 0}p{color:#52635d}.cards{display:flex;gap:20px;margin:32px 0;flex-wrap:wrap}.card{flex:1;min-width:220px;background:white;border:1px solid #dce2dc;border-radius:18px;padding:24px}button{background:#193e32;border:0;color:white;padding:14px 22px;border-radius:9px;font:inherit;cursor:pointer}button:disabled{opacity:.5}a{color:#193e32}code{background:#e9ede6;padding:3px 6px;border-radius:4px}#status{min-height:28px}details{margin-top:28px}footer{margin-top:42px;border-top:1px solid #dce2dc;padding-top:20px;font-size:14px}</style>
<main>${content}</main><script nonce="${nonce}">${script}</script></html>`)
}
const exchangeScript = (endpoint: string, success: string) => `function exchange(){const secret=location.hash.slice(1);history.replaceState(null,'',location.pathname);if(secret){fetch('${endpoint}',{method:'POST',headers:{'content-type':'text/plain'},body:secret}).then(async r=>{if(!r.ok)throw Error('This link expired. Run start again to open a fresh link.');${success}}).catch(e=>document.querySelector('#status').textContent=e.message)}};addEventListener('hashchange',exchange);exchange()`

export interface ExperienceOptions {
  directory: string
  instance: string
  image: string
  port: number
  provider?: RuntimeProvider
  /** Used by the CLI to stop itself after the HTTP response has completed. */
  onStop?: () => void
}

export async function startExperience(options: ExperienceOptions) {
  const repository = new SQLiteDomainRepository(join(options.directory, 'directory'))
  const owners = ['alice', 'bob'].map(principalId => ({ tenantId: 'local-demo', principalId }))
  const records = owners.map(owner => repository.resolve(owner))
  const provider = options.provider ?? new DesktopDockerRuntimeProvider({ image: options.image, instance: options.instance,
    principal: id => { const record = records.find(record => record.id === id); if (!record) throw new Error('Unknown Principal'); return record.owner.principalId } })
  const runtime = new DomainRuntimeCoordinator(repository, provider, '0.1.5-rc.2', 90_000, 30_000)
  const sessions = new MemoryDomainSessions('dsh-experience-session')
  const control = token()
  const admin = token()
  const tickets = new Map<string, { target: string; until: number }>()
  let port = options.port
  const portalHost = () => `dsh.${options.instance}.localhost:${port}`
  const portalOrigin = () => `http://${portalHost()}`
  const domainHost = (name: string) => `${name}.${options.instance}.localhost:${port}`
  const ingress = createDomainIngress({ authenticator: sessions, runtime, originFor: owner => `http://${domainHost(owner.principalId)}` })
  const grant = (target: string) => {
    for (const [key, value] of tickets) if (value.until < Date.now()) tickets.delete(key)
    if (tickets.size >= 100) throw new Error('Too many pending sign-ins')
    const value = token(); tickets.set(value, { target, until: Date.now() + 120_000 }); return value
  }
  const consume = (value: string, target: string) => { const ticket = tickets.get(value); tickets.delete(value); return ticket?.target === target && ticket.until >= Date.now() }
  const openUrl = () => `${portalOrigin()}/#${grant('platform')}`
  const requireOrigin = (req: IncomingMessage, host: string) => req.headers.host === host && req.headers.origin === `http://${host}`
  const administrator = (req: IncomingMessage) => {
    const cookies = (req.headers.cookie ?? '').split(';').map(item => item.trim()).filter(item => item.startsWith('dsh-experience-admin='))
    return cookies.length === 1 && equal(cookies[0]!.slice('dsh-experience-admin='.length), admin)
  }
  const seededPath = join(options.directory, 'seeded.json')
  let seeded: string[] = []
  try { seeded = JSON.parse(await readFile(seededPath, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { repository.close(); throw error } }
  const seeds = new Map<string, Promise<void>>()
  async function prepare(index: number) {
    const record = records[index]!
    const admission = await runtime.ensure(record.owner)
    if (seeded.includes(record.id) || options.provider) return
    let task = seeds.get(record.id)
    if (!task) {
      task = (async () => {
        const rpc = async (method: string, args: unknown) => {
          const response = await fetch(`${admission.endpoint}/api/${method}`, { method: 'POST', signal: AbortSignal.any([admission.signal, AbortSignal.timeout(15_000)]), headers: { cookie: admission.authentication!.cookie, origin: admission.endpoint, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: token(), method, payload: { args } }) })
          const result = await response.json() as any
          if (!result.result?.ok) throw new Error(`Could not prepare the welcome workspace (${method})`)
          return result.result.value
        }
        const workspace = await rpc('workspace/create', { request: { path: '/domain/workspace' } })
        const native = await rpc('session/list', { _request: {} })
        if (!native.items.some((item: { sessionId: string }) => item.sessionId === record.id)) {
          await rpc('session/create', { request: { sessionId: record.id, workspaceId: workspace.workspace.workspaceId, agentPreset: 'demo' } })
        }
        await rpc('session/rename', { request: { sessionId: record.id, title: `${record.owner.principalId} · Try “Read my sample”` } })
        seeded.push(record.id)
        await writeFile(seededPath, JSON.stringify(seeded), { mode: 0o600 })
      })().finally(() => seeds.delete(record.id))
      seeds.set(record.id, task)
    }
    await task
  }
  const server = createServer((req, res) => {
    void (async () => {
      if (req.headers.host === portalHost()) {
        if (req.url === '/control' && req.method === 'POST' && !req.headers.origin && equal(req.headers.authorization ?? '', `Bearer ${control}`)) {
          const command = await body(req)
          if (command === 'open') json(res, 200, { url: openUrl() })
          else if (command === 'stop') { json(res, 200, { stopping: true }); setImmediate(() => options.onStop?.()) }
          else json(res, 200, { running: true, version: '0.8.0', instance: options.instance })
          return
        }
        if (req.url === '/bootstrap' && req.method === 'POST' && requireOrigin(req, portalHost())) {
          if (!consume(await body(req), 'platform')) { json(res, 401, { error: 'Link expired' }); return }
          res.setHeader('set-cookie', `dsh-experience-admin=${admin}; Path=/; HttpOnly; SameSite=Strict`)
          json(res, 200, { ok: true }); return
        }
        if (req.url?.startsWith('/launch/') && req.method === 'POST' && requireOrigin(req, portalHost()) && administrator(req)) {
          const index = owners.findIndex(owner => req.url === `/launch/${owner.principalId}`)
          if (index < 0) { json(res, 404, {}); return }
          await prepare(index)
          json(res, 200, { url: `http://${domainHost(owners[index]!.principalId)}/_experience/enter#${grant(owners[index]!.principalId)}` }); return
        }
        if (req.url === '/' && req.method === 'GET') {
          const authorized = administrator(req)
          page(res, `<small>DSH / LOCAL WORKBENCH · 本机体验</small><h1>Your workspace.<br>Your own DSH.</h1><p>原生工作台，两个独立用户。无需 API key 即可体验。</p><div class="cards">${owners.map(owner => `<section class="card"><h2>${owner.principalId === 'alice' ? 'Alice' : 'Bob'}</h2><p>独立会话、项目文件和模型配置。</p><button data-user="${owner.principalId}" ${authorized ? '' : 'disabled'}>进入工作台 →</button></section>`).join('')}</div><p id="status">${authorized ? '准备好了。首次进入会启动该用户的运行环境。' : '正在验证启动链接。若链接已失效，请再次执行 start。'}</p><details><summary>连接自己的模型 / Use your own model</summary><p>进入工作台，在原生 Settings 中配置模型凭据，然后在会话中选择真实模型。Alice 和 Bob 的配置分别保存。</p></details><footer>默认是明确标识的演示模型，不是 AI。进入后试试：<code>读取样例</code> <code>生成文件</code> <code>委派子代理</code><p>Ctrl-C 停止运行；再次启动保留数据。本机演示身份不用于公网账号系统。</p></footer>`,
            exchangeScript('/bootstrap', "location.replace('/')") + `;document.querySelectorAll('[data-user]').forEach(button=>button.onclick=async()=>{button.disabled=true;const status=document.querySelector('#status');status.textContent='正在启动原生 DSH，首次进入可能需要几十秒…';try{const r=await fetch('/launch/'+button.dataset.user,{method:'POST'});const data=await r.json();if(!r.ok)throw Error(data.error||'启动失败，请运行 doctor 查看环境。');location.assign(data.url)}catch(e){status.textContent=e.message;button.disabled=false}})`)
          return
        }
        json(res, 401, { error: 'Open the fresh link printed by start.' }); return
      }
      const owner = owners.find(item => req.headers.host === domainHost(item.principalId))
      if (!owner) { json(res, 403, { error: 'Unknown host' }); return }
      if (req.url === '/_experience/enter' && req.method === 'GET') {
        page(res, '<h1>Opening your workspace</h1><p id="status">正在进入原生 DSH…</p>', exchangeScript('/_experience/exchange', "location.replace('/')")); return
      }
      if (req.url === '/_experience/exchange' && req.method === 'POST' && requireOrigin(req, domainHost(owner.principalId))) {
        if (!consume(await body(req), owner.principalId)) { json(res, 401, { error: 'Link expired' }); return }
        res.setHeader('set-cookie', `dsh-experience-session=${sessions.issue(owner)}; Path=/; HttpOnly; SameSite=Strict`)
        json(res, 200, { ok: true }); return
      }
      ingress.server.emit('request', req, res)
    })().catch(() => { if (res.headersSent) res.destroy(); else json(res, 503, { error: 'Workspace could not start. Run dsh-multi-tenant doctor, then retry. Your data is retained.' }) })
  })
  server.on('upgrade', (req, socket, head) => {
    if (!owners.some(owner => req.headers.host === domainHost(owner.principalId))) { socket.destroy(); return }
    ingress.server.emit('upgrade', req, socket, head)
  })
  let closed: Promise<void> | undefined
  const close = () => closed ??= (async () => {
    sessions.close()
    const results = await Promise.allSettled([ingress.close(), runtime.close()])
    const errors = results.flatMap(item => item.status === 'rejected' ? [item.reason] : [])
    if (errors.length) { closed = undefined; throw new AggregateError(errors, 'Experience shutdown failed; retry stop') }
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })()
  try {
    for (const record of records) if (record.unresolved) await runtime.recover(record.id)
    server.listen(port, '127.0.0.1')
    try { await once(server, 'listening') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      server.listen(0, '127.0.0.1'); await once(server, 'listening')
    }
    port = (server.address() as { port: number }).port
    return { server, runtime, close, openUrl, control, port, portalHost: portalHost() }
  } catch (error) { await close(); throw error }
}
