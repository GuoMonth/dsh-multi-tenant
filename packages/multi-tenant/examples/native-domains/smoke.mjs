// Fast installed-consumer proof using an explicitly simulated native HTTP endpoint.
// The repository's probe:isolated separately exercises installed APIs with real DSH.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SQLiteDomainRepository, DomainRuntimeCoordinator, MemoryDomainSessions, createDomainIngress, DSH_RUNTIME_VERSION } from 'dsh-multi-tenant'
import { createPlatform } from './platform.mjs'
assert.equal(typeof createPlatform, 'function')
assert.match(await readFile(new URL(import.meta.resolve('dsh-multi-tenant/native/runtime-control.mjs')), 'utf8'), /appReady/)
const root = await mkdtemp(join(tmpdir(), 'domain-consumer-'))
const repository = new SQLiteDomainRepository(root)
const sessions = new MemoryDomainSessions('domain-session')
const handles = new Map()
const runtime = new DomainRuntimeCoordinator(repository, { acquire(spec) {
  let exited
  const exit = new Promise(resolve => { exited = resolve })
  const server = createServer((request, response) => {
    if (request.headers.cookie !== `native=${spec.domainId}`) response.writeHead(401).end()
    else response.end(spec.domainId)
  })
  const ready = (async () => { server.listen(0, '127.0.0.1'); await once(server, 'listening')
    return { ...spec, endpoint: `http://127.0.0.1:${server.address().port}`, authentication: { cookie: `native=${spec.domainId}` } }
  })()
  const handle = { ready, exited: exit, async stop() { await ready; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); exited() } }
  handles.set(spec.domainId, handle)
  return handle
} }, DSH_RUNTIME_VERSION)
let origin
const ingress = createDomainIngress({ authenticator: sessions, runtime, originFor: () => origin })
try {
  ingress.server.listen(0, '127.0.0.1'); await once(ingress.server, 'listening')
  origin = `http://127.0.0.1:${ingress.server.address().port}`
  const owners = [{ tenantId: 'tenant-a', principalId: 'alice' }, { tenantId: 'tenant-b', principalId: 'alice' }]
  const tokens = owners.map(owner => sessions.issue(owner))
  const responses = await Promise.all(tokens.map(token => fetch(origin, { headers: { cookie: `domain-session=${token}` } }).then(response => response.text())))
  assert.notEqual(responses[0], responses[1])
  assert.equal(handles.size, 2)
  await runtime.setDesired(responses[0], 'revoked')
  assert.equal((await fetch(origin, { headers: { cookie: `domain-session=${tokens[0]}` } })).status, 503)
  assert.equal(await (await fetch(origin, { headers: { cookie: `domain-session=${tokens[1]}` } })).text(), responses[1])
} finally {
  sessions.close()
  const results = await Promise.allSettled([ingress.close(), runtime.close()])
  await rm(root, { recursive: true, force: true })
  for (const result of results) if (result.status === 'rejected') throw result.reason
}

console.log('Package smoke passed (simulated runtime; no native DSH Host started).')
