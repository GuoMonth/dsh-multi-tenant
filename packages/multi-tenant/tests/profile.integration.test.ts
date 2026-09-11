import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

it('registers and releases the optional panel through the real native slot registry', async () => {
  const { apply } = await import(new URL('../examples/scoped-web/slots.mjs', import.meta.url).href)
  const ctx = new Context()
  try {
    // rc.2 ships client code in the native ModuleLoader envelope, not ESM.
    // Evaluate the actual packed factory with its actual dependencies; no registry substitute.
    const require = createRequire(import.meta.url)
    let exported: { SlotRegistry: typeof import('@deepseek-ai/dsh-client-ui-renderer/client').SlotRegistry } | undefined
    const source = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'), 'utf8')
    runInNewContext(source, { window: { __ModuleLoader__: { load(bundle: { factory(require: NodeRequire): unknown }) { exported = bundle.factory(require) as typeof exported } } }, console })
    await ctx.plugin(exported!.SlotRegistry)
    const plugin = await ctx.plugin({ inject: ['slots'], apply })
    const slots = ctx.get('slots') as unknown as { register(options: object, component: unknown): () => void; entriesOfSlot(name: string): Array<{ options: { id?: string; key?: string } }> }
    slots.register({ name: 'root', children: { 'sidebar.panellist': { kind: 'list', scope: 'root' }, main: { kind: 'keyed', scope: 'root' } } }, () => null)
    expect(slots.entriesOfSlot('sidebar.panellist').map(entry => entry.options.id)).toEqual(['multi-tenant'])
    expect(slots.entriesOfSlot('main').map(entry => entry.options.key)).toEqual(['multi-tenant'])
    await plugin.dispose()
    expect(slots.entriesOfSlot('main')).toEqual([])
    expect(slots.entriesOfSlot('sidebar.panellist')).toEqual([])
  } finally { await ctx.fiber.dispose() }
})

it('boots the packaged scoped profile, executes native delegation/present, and omits stock privileged routes', async () => {
  const { startProfile } = await import(new URL('../examples/scoped-web/profile.mjs', import.meta.url).href)
  const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-profile-'))
  const profile = await startProfile({ directory })
  try {
    const login = await fetch(`${profile.origin}/demo/login`, { method: 'POST', body: JSON.stringify({ identity: 'acme-alice' }) })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!
    const headers = { cookie }
    const base = `${profile.origin}/_dsh-multi-tenant/agents`
    const created = await fetch(base, { method: 'POST', headers, body: '{"profile":"demo"}' })
    expect(created.status).toBe(201)
    const { agent } = await created.json() as { agent: { id: string } }
    for (const text of ['/delegate', '/present']) {
      const response = await fetch(`${base}/${agent.id}/messages`, { method: 'POST', headers, body: JSON.stringify({ text }) })
      expect(response.status).toBe(202)
      await expect.poll(async () => {
        const page = await (await fetch(`${base}/${agent.id}/history`, { headers })).json() as { active: boolean }
        return page.active
      }).toBe(false)
    }
    const childList = await (await fetch(`${base}/${agent.id}/children`, { headers })).json() as { children: unknown[] }
    expect(childList.children).toHaveLength(1)
    const fileList = await (await fetch(`${base}/${agent.id}/deliveries`, { headers })).json() as { deliveries: Array<{ ref: string }> }
    expect(fileList.deliveries).toHaveLength(1)
    expect((await fetch(`${base}/${agent.id}/deliveries/${encodeURIComponent(fileList.deliveries[0]!.ref)}`, { headers })).status).toBe(200)
    for (const path of ['/api', '/api/settings', '/api/plugins', '/api/openWorkspacePath']) {
      expect((await fetch(profile.origin + path, { headers })).status).toBe(404)
    }
    expect((await fetch(base, { method: 'POST', headers: { cookie, origin: 'https://untrusted.example' }, body: '{}' })).status).toBe(401)
    const page = await fetch(`${profile.origin}/tenant-panel`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-security-policy')).toContain("script-src 'self'")
  } finally { await profile.close(); await rm(directory, { recursive: true, force: true }) }
})
