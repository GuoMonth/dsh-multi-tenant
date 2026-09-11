/** Explicit, loopback-only Cordis profile. Stock Connection/Remote controllers are not mounted. */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Projections from '@deepseek-ai/dsh-session-projection'
import SessionQuery from '@deepseek-ai/dsh-session-query-sqlite'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as SubagentTool from '@deepseek-ai/dsh-tool-subagent'
import * as Present from '@deepseek-ai/dsh-tool-present'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as MultiTenant from 'dsh-multi-tenant'
import { openNativeDelivery } from 'dsh-multi-tenant/deliveries'
import { mountMultiTenantWeb, readCookie } from 'dsh-multi-tenant/web'
import { DemoModel } from './model.mjs'

export async function startProfile({ directory, port = 0 }) {
  const identities = new Map([
    ['acme-alice', MultiTenant.createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })],
    ['acme-bob', MultiTenant.createPrincipalContext({ tenantId: 'acme', principalId: 'bob' })],
    ['globex-alice', MultiTenant.createPrincipalContext({ tenantId: 'globex', principalId: 'alice' })],
  ])
  const workspace = principal => join(directory, principal.tenantId, principal.principalId)
  for (const [identity, principal] of identities) {
    await mkdir(workspace(principal), { recursive: true })
    await writeFile(join(workspace(principal), 'report.html'), `<h1>${identity} report</h1><script>globalThis.deliveryScriptExecuted=true</script>`, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error })
  }
  const ctx = new Context()
  try {
    for (const plugin of [LlmRuntime, SessionStore, Projections, SystemPrompt, Tools, AgentRegistry]) await ctx.plugin(plugin)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(Persistence, { root: join(directory, 'sessions'), compression: 'none' })
    await ctx.plugin(SessionQuery, { path: join(directory, 'query.sqlite') })
    await ctx.plugin(Subagents)
    await ctx.plugin(Spawn, { providerName: 'spawn' })
    await ctx.plugin(SubagentTool, { provider: 'spawn', backgroundMode: 'continuable', maxDepth: 3 })
    await ctx.plugin(LocalFileSystem, { cwd: directory })
    await ctx.plugin(Present, { maxFiles: 8 })
    class Partition extends MultiTenant.SharedDshRuntimePartitionProvider {
      openFile(request) {
        return openNativeDelivery(request, { fs: this.ctx.get('fs'), workspace: workspace(request.principal), dispose() {} })
      }
    }
    await ctx.plugin(Partition)
    await ctx.plugin(MultiTenant, { sqlite: { path: join(directory, 'agents.sqlite') } })
    ctx.llm.registerAdapter(['demo'], new DemoModel())
    await ctx.plugin(WebServer, { host: '127.0.0.1', port })
    const origin = `http://127.0.0.1:${ctx.webServer.port}`
    const safeOrigin = req => (!req.headers.origin || req.headers.origin === origin) && req.headers['sec-fetch-site'] !== 'cross-site'
    mountMultiTenantWeb(ctx, ctx.multiTenant, {
      principalProvider: { authenticate(req) { return safeOrigin(req) ? identities.get(readCookie(req.headers, 'dsh_mt_demo')) : undefined } },
      resolveAgentProfile(principal, name) { return name === 'demo' ? { meta: { cwd: workspace(principal) }, agentOptions: { provider: 'demo', model: 'test' } } : undefined },
    })
    ctx.webServer.register({ kind: 'exact', path: '/demo/login', async handler(req, res) {
      if (req.method !== 'POST' || !safeOrigin(req)) { res.writeHead(403).end(); return }
      let body = ''
      for await (const chunk of req) { body += chunk; if (body.length > 1024) { res.writeHead(400).end(); return } }
      let identity
      try { identity = JSON.parse(body).identity } catch { res.writeHead(400).end(); return }
      if (!identities.has(identity)) { res.writeHead(400).end(); return }
      res.writeHead(204, { 'set-cookie': `dsh_mt_demo=${identity}; HttpOnly; SameSite=Strict; Path=/`, 'cache-control': 'no-store' }).end()
    } })
    for (const [path, file, type] of [['/tenant-panel', 'panel.html', 'text/html; charset=utf-8'], ['/demo/panel.js', 'panel.js', 'text/javascript; charset=utf-8'], ['/demo/panel.css', 'panel.css', 'text/css; charset=utf-8']]) {
      const bytes = await readFile(new URL(file, import.meta.url))
      ctx.webServer.register({ kind: 'exact', path, handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405).end(); return }
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'" }).end(bytes)
      } })
    }
    return { ctx, origin, close: () => ctx.fiber.dispose() }
  } catch (error) { await ctx.fiber.dispose(); throw error }
}
