import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, expect, it } from 'vitest'
import { MemoryDomainSessions } from '../../src/ingress/authentication.ts'
import { createDomainIngress } from '../../src/ingress/server.ts'

const cleanups: (() => Promise<unknown> | void)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
async function listen(server: Server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

async function setup() {
  const native = createServer((req, res) => {
    if (req.headers.cookie !== 'native=private') { res.writeHead(401).end(); return }
    res.setHeader('set-cookie', 'native=never-expose')
    if (req.url === '/stream') { res.writeHead(200); res.write('first'); return }
    if (req.url === '/echo') { req.pipe(res); return }
    res.end(JSON.stringify(req.headers))
  })
  const ws = new WebSocketServer({ server: native })
  ws.on('connection', socket => { socket.on('message', data => socket.send(data)) })
  const endpoint = await listen(native)
  cleanups.push(async () => {
    for (const socket of ws.clients) socket.terminate()
    ws.close()
    native.closeAllConnections()
    await new Promise<void>(resolve => native.close(() => resolve()))
  })
  const sessions = new MemoryDomainSessions('domain-session')
  cleanups.push(() => sessions.close())
  const alice = { tenantId: 'acme', principalId: 'alice' }
  const bob = { tenantId: 'acme', principalId: 'bob' }
  const a = sessions.issue(alice)
  const b = sessions.issue(bob)
  const runtime = new AbortController()
  let calls = 0
  let origin = ''
  const ingress = createDomainIngress({
    authenticator: sessions,
    originFor: owner => owner.principalId === 'alice' ? origin : 'https://bob.example',
    runtime: { ensure: async () => { calls++; return {
      domainId: 'domain-a', generation: 1, revision: 0, version: '0.1.5-rc.2', endpoint,
      signal: runtime.signal, authentication: { cookie: 'native=private' },
    } } },
  })
  origin = await listen(ingress.server)
  cleanups.push(() => ingress.close())
  const headers = { cookie: `domain-session=${a}`, origin }
  return { origin, headers, sessions, a, b, runtime, getCalls: () => calls, ingress }
}

it('rejects missing/duplicate/cross-owner cookies and cross-origin calls before runtime lookup', async () => {
  const t = await setup()
  expect((await fetch(t.origin)).status).toBe(401)
  expect((await fetch(t.origin, { headers: { cookie: `domain-session=${t.a}; domain-session=${t.b}` } })).status).toBe(401)
  expect((await fetch(t.origin, { headers: { cookie: `domain-session=${t.b}` } })).status).toBe(403)
  expect((await fetch(t.origin, { headers: { ...t.headers, origin: 'https://evil.example' } })).status).toBe(403)
  expect((await fetch(t.origin, { method: 'POST', headers: { cookie: t.headers.cookie } })).status).toBe(403)
  expect(t.getCalls()).toBe(0)
})

it('maps internal authority, strips user credentials and does not expose native cookies', async () => {
  const t = await setup()
  const response = await fetch(t.origin, { headers: {
    ...t.headers, authorization: 'Bearer evil', 'x-forwarded-host': 'bob.example', 'x-dsh-principal': 'bob',
  } })
  expect(response.status).toBe(200)
  expect(response.headers.get('set-cookie')).toBeNull()
  expect(response.headers.get('cache-control')).toBe('no-store')
  const received = await response.json()
  expect(received.cookie).toBe('native=private')
  expect(received.origin).not.toBe(t.origin)
  expect(received.authorization).toBeUndefined()
  expect(received['x-dsh-principal']).toBeUndefined()
  expect(received['x-forwarded-host']).toBeUndefined()
})

it('streams raw binary without rewriting bytes and preserves HEAD', async () => {
  const t = await setup()
  const body = Buffer.alloc(2 * 1024 * 1024, 0xa7)
  const response = await fetch(`${t.origin}/echo`, { method: 'POST', headers: t.headers, body })
  expect(Buffer.from(await response.arrayBuffer()).equals(body)).toBe(true)
  const head = await fetch(t.origin, { method: 'HEAD', headers: t.headers })
  expect(head.status).toBe(200)
  expect(await head.text()).toBe('')
})

it('cancels a streaming HTTP response when its authentication session is revoked', async () => {
  const t = await setup()
  const response = await fetch(`${t.origin}/stream`, { headers: t.headers })
  const reader = response.body!.getReader()
  expect((await reader.read()).done).toBe(false)
  t.sessions.revoke(t.a)
  await expect(reader.read()).rejects.toThrow()
  expect((await fetch(t.origin, { headers: t.headers })).status).toBe(401)
})

it('transparently tunnels WebSocket frames and closes the old generation on invalidation', async () => {
  const t = await setup()
  const socket = new WebSocket(t.origin.replace('http:', 'ws:') + '/mux', { headers: t.headers })
  cleanups.push(() => socket.terminate())
  await once(socket, 'open')
  const received = once(socket, 'message')
  socket.send(Buffer.from([0, 255, 23, 0]))
  expect((await received)[0]).toEqual(Buffer.from([0, 255, 23, 0]))
  const closed = once(socket, 'close')
  t.runtime.abort()
  await closed
})

it('expires sessions and closes pending admission even if the authenticator never settles', async () => {
  const t = await setup()
  const token = t.sessions.issue({ tenantId: 'acme', principalId: 'alice' }, 20)
  await expect.poll(async () => (await fetch(t.origin, { headers: { cookie: `domain-session=${token}` } })).status).toBe(401)
  const ingress = createDomainIngress({ authenticator: { authenticate: () => new Promise(() => {}) },
    originFor: () => 'https://unused.example', runtime: { ensure: () => { throw new Error('must not start') } } })
  const origin = await listen(ingress.server)
  const pending = fetch(origin)
  const failed = expect(pending).rejects.toThrow()
  await new Promise(resolve => setTimeout(resolve, 25))
  await ingress.close()
  await ingress.close()
  await failed
})
