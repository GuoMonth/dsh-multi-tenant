import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as Present from '@deepseek-ai/dsh-tool-present'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'
import { createPrincipalContext, SharedDshRuntimePartitionProvider, type AgentId, type FileReadRequest, type PrincipalContext } from '../src/index.ts'
import { openNativeDelivery } from '../src/deliveries.ts'
import { mountMultiTenantWeb } from '../src/web.ts'
import { openRuntime } from './fixtures/runtime.ts'
import { TestModel } from './fixtures/model.ts'

it('serves only authorized native delivery facts through real FS/HTTP, including cold children', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-delivery-'))
  const alice = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
  const bob = createPrincipalContext({ tenantId: 'acme', principalId: 'bob' })
  const outside = createPrincipalContext({ tenantId: 'globex', principalId: 'alice' })
  const identities = new Map([['alice', alice], ['bob', bob], ['outside', outside]])
  const workspace = (principal: PrincipalContext) => join(directory, `${principal.tenantId}-${principal.principalId}`)
  let releases = 0
  let fileOpens = 0
  let holdDelivery = false
  let authorization = new AbortController()
  class Partition extends SharedDshRuntimePartitionProvider {
    override async openFile(request: FileReadRequest) {
      fileOpens++
      const file = await openNativeDelivery(request, { fs: this.ctx.get('fs')!, workspace: workspace(request.principal), signal: authorization.signal, dispose() { releases++ } })
      if (!holdDelivery) return file
      return { ...file, content: { async *[Symbol.asyncIterator]() {
        for await (const chunk of file.content) {
          yield chunk.subarray(0, 1)
          await new Promise<void>((_, reject) => {
            if (file.signal!.aborted) reject(file.signal!.reason)
            else file.signal!.addEventListener('abort', () => reject(file.signal!.reason), { once: true })
          })
          yield chunk.subarray(1)
        }
      } } }
    }
  }
  // The service is installed last by the fixture; mount after it is ready.
  const create = async () => {
    const ctx = await openRuntime(join(directory, 'agents.sqlite'), join(directory, 'sessions'), true, true, async ctx => {
      await ctx.plugin(LocalFileSystem, { cwd: directory })
      await ctx.plugin(Present, { maxFiles: 8 })
      await ctx.plugin(Partition)
      await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    })
    mountMultiTenantWeb(ctx, ctx.multiTenant, { principalProvider: { authenticate(req) { return identities.get(req.headers.authorization ?? '') } } })
    return ctx
  }
  let ctx = await create()
  try {
    await mkdir(workspace(alice)); await mkdir(workspace(bob))
    await writeFile(join(workspace(alice), 'report.html'), '<script>globalThis.pwned=true</script>version one')
    await writeFile(join(workspace(bob), 'private.txt'), 'Bob only')
    const model = new TestModel()
    ctx.llm.registerAdapter(['test'], model)
    const resource = await ctx.multiTenant.create(alice, { meta: { cwd: workspace(alice) }, agentOptions: { provider: 'test', model: 'test' } })
    const other = await ctx.multiTenant.create(bob, { meta: { cwd: workspace(bob) }, agentOptions: { provider: 'test', model: 'test' } })
    const publish = async (id: AgentId, paths: string[]) => {
      model.before = async () => {
        delete model.before
        const result = await ctx.multiTenant.executeTool(alice, id, 'present', { files: paths.map(path => ({ path })) })
        expect(result.isError).toBe(false)
      }
      await ctx.multiTenant.send(alice, id, 'present report')
      await ctx.multiTenant.whenIdle(alice, id)
    }
    await publish(resource.id, ['report.html', join(workspace(bob), 'private.txt')])
    const deliveries = await ctx.multiTenant.deliveries(alice, resource.id)
    expect(deliveries).toHaveLength(2)
    expect(JSON.stringify(deliveries)).not.toContain(directory)
    const ref = deliveries[0]!.ref
    const url = () => `http://127.0.0.1:${ctx.webServer.port}/_dsh-multi-tenant/agents/${resource.id}/deliveries/${encodeURIComponent(ref)}`
    const get = (authorization = 'alice', suffix = '') => fetch(url() + suffix, { headers: { authorization } })
    expect((await fetch(url())).status).toBe(401)
    const before = fileOpens
    for (const identity of ['bob', 'outside']) expect((await get(identity)).status).toBe(404)
    expect(fileOpens).toBe(before)
    expect((await fetch(url().replace(resource.id, other.id), { headers: { authorization: 'bob' } })).status).toBe(404)
    expect((await get('alice', '?path=/etc/passwd')).status).toBe(400)
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    expect(await response.text()).toContain('version one')
    expect((await get('alice', '?download=1')).headers.get('content-disposition')).toContain('attachment')
    const head = await fetch(url(), { method: 'HEAD', headers: { authorization: 'alice' } })
    expect(head.status).toBe(200); expect(await head.text()).toBe('')
    const forbidden = url().replace(encodeURIComponent(ref), encodeURIComponent(deliveries[1]!.ref))
    expect((await fetch(forbidden, { headers: { authorization: 'alice' } })).status).toBe(404)
    for (const forged of [`${resource.id}:0:0`, `${ref}0`, `${resource.id}:99999:0`]) {
      expect((await fetch(url().replace(encodeURIComponent(ref), encodeURIComponent(forged)), { headers: { authorization: 'alice' } })).status).toBe(404)
    }
    const record = await ctx.tenantAgentRepository.get(alice, resource.id)
    const parent = ctx.agents.get(SessionId(record!.sessionId))!
    model.before = async options => {
      delete model.before
      const child = ctx.agents.list().find(agent => agent.session.header.parentSession === parent.id)!
      const result = await ctx.tools.execute({ callId: ToolCallId('child-present'), name: 'present', arguments: { files: [{ path: 'report.html' }] }, agent: child, signal: options.signal! })
      expect(result.isError).toBe(false)
    }
    const child = await ctx.subagents.startContinuable({ provider: 'spawn', label: 'delivery child', request: { parent, prompt: [{ type: 'text', text: 'present' }] }, signal: new AbortController().signal })
    await ctx.agents.get(child.childId)?.whenIdle()
    const childRef = (await ctx.multiTenant.children(alice, resource.id))[0]!.ref
    await expect.poll(async () => (await ctx.multiTenant.deliveries(alice, resource.id, { childRef })).length).toBe(1)
    const childFileRef = (await ctx.multiTenant.deliveries(alice, resource.id, { childRef }))[0]!.ref
    await ctx.fiber.dispose()
    ctx = await create()
    const childUrl = `http://127.0.0.1:${ctx.webServer.port}/_dsh-multi-tenant/agents/${resource.id}/children/${childRef}/deliveries/${encodeURIComponent(childFileRef)}`
    const childFile = await fetch(childUrl, { headers: { authorization: 'alice' } })
    expect(childFile.status).toBe(200); expect(await childFile.text()).toContain('version one')
    expect(ctx.agents.list()).toEqual([])
    await writeFile(join(workspace(alice), 'report.html'), 'version two')
    expect(await (await get()).text()).toBe('version two')
    await rm(join(workspace(alice), 'report.html'))
    expect((await get()).status).toBe(404)
    await symlink(join(workspace(bob), 'private.txt'), join(workspace(alice), 'report.html'))
    expect((await get()).status).toBe(404)
    await rm(join(workspace(alice), 'report.html'))
    await mkdir(join(workspace(alice), 'report.html'))
    expect((await get()).status).toBe(404)
    await rm(join(workspace(alice), 'report.html'), { recursive: true })
    await writeFile(join(workspace(alice), 'report.html'), Buffer.alloc(16 * 1024 * 1024 + 1))
    expect((await get()).status).toBe(400)
    await writeFile(join(workspace(alice), 'report.html'), 'ab')
    holdDelivery = true
    for (const cause of ['disconnect', 'revoke', 'delete']) {
      const abort = new AbortController()
      const streaming = await fetch(url(), { headers: { authorization: 'alice' }, signal: abort.signal })
      const reader = streaming.body!.getReader()
      expect((await reader.read()).value).toEqual(new Uint8Array([97]))
      const pending = expect(reader.read()).rejects.toThrow()
      if (cause === 'disconnect') abort.abort()
      else if (cause === 'revoke') authorization.abort()
      else await ctx.multiTenant.delete(alice, resource.id)
      await pending
      await expect.poll(() => releases).toBe(fileOpens)
      authorization = new AbortController()
    }
    expect((await get()).status).toBe(404)
    await expect.poll(() => releases).toBe(fileOpens)
  } finally { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) }
})
