/** Run against the installed tarball with native runtime peers present. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startProfile } from './profile.mjs'

const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-profile-smoke-'))
const profile = await startProfile({ directory })
try {
  const base = `${profile.origin}/_dsh-multi-tenant/agents`
  const headers = { cookie: 'dsh_mt_demo=acme-alice' }
  assert.equal((await fetch(base)).status, 401)
  const created = await fetch(base, { method: 'POST', headers, body: '{"profile":"demo"}' })
  assert.equal(created.status, 201)
  const { agent } = await created.json()
  assert.equal((await fetch(`${base}/${agent.id}`, { headers: { cookie: 'dsh_mt_demo=acme-bob' } })).status, 404)
  const timeout = AbortSignal.timeout(5000)
  for (const text of ['/delegate', '/present']) {
    assert.equal((await fetch(`${base}/${agent.id}/messages`, { method: 'POST', headers, body: JSON.stringify({ text }) })).status, 202)
    for (;;) {
      timeout.throwIfAborted()
      const page = await (await fetch(`${base}/${agent.id}/history`, { headers, signal: timeout })).json()
      if (!page.active) break
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  const { children } = await (await fetch(`${base}/${agent.id}/children`, { headers })).json()
  assert.equal(children.length, 1)
  const { deliveries } = await (await fetch(`${base}/${agent.id}/deliveries`, { headers })).json()
  assert.equal(deliveries.length, 1)
  const file = await fetch(`${base}/${agent.id}/deliveries/${encodeURIComponent(deliveries[0].ref)}`, { headers })
  assert.equal(file.status, 200)
  assert.match(await file.text(), /acme-alice report/)
  for (const path of ['/api', '/api/settings', '/api/plugins', '/api/openWorkspacePath']) assert.equal((await fetch(profile.origin + path, { headers })).status, 404)
  console.log('installed native scoped profile smoke passed')
} finally { await profile.close(); await rm(directory, { recursive: true, force: true }) }
