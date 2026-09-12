import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { startExperience } from '../../src/cli/app.ts'
import type { RuntimeProvider } from '../../src/runtime/provider.ts'

it('requires single-use bootstrap and per-origin tickets before native HTTP; denies identity swapping', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-experience-test-'))
  const instance = randomUUID()
  const backend = createServer((req, res) => { res.end(req.headers.cookie) })
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening')
  const endpoint = `http://127.0.0.1:${(backend.address() as { port: number }).port}`
  let starts = 0
  const provider: RuntimeProvider = { acquire: spec => { starts++; return { ready: Promise.resolve({ ...spec, endpoint, authentication: { cookie: `native=${spec.domainId}` } }), exited: new Promise(() => {}), stop: async () => {} } } }
  const app = await startExperience({ directory, instance, image: `sha256:${'0'.repeat(64)}`, port: 0, provider })
  const base = `http://127.0.0.1:${app.port}`
  const portal = app.portalHost
  const call = (host: string, path: string, options: RequestInit = {}): Promise<Response> => new Promise((resolve, reject) => {
    const req = request(base + path, { method: options.method ?? 'GET', headers: { host, ...Object.fromEntries(new Headers(options.headers)) } }, res => {
      const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode!, headers: Object.fromEntries(Object.entries(res.headers).filter((entry) => entry[1] !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value.join('; ') : String(value)])) })))
    }); req.on('error', reject); req.end(options.body)
  })
  try {
    expect((await call('evil.example', '/')).status).toBe(403)
    expect((await call(portal, '/launch/alice', { method: 'POST', headers: { origin: `http://${portal}` } })).status).toBe(401)
    expect(starts).toBe(0)
    const ticket = new URL(app.openUrl()).hash.slice(1)
    expect((await call(portal, '/bootstrap', { method: 'POST', body: ticket, headers: { origin: 'http://evil.example' } })).status).toBe(401)
    const bootstrap = await call(portal, '/bootstrap', { method: 'POST', body: ticket, headers: { origin: `http://${portal}` } })
    expect(bootstrap.status).toBe(200)
    const admin = bootstrap.headers.get('set-cookie')!.split(';')[0]!
    expect((await call(portal, '/bootstrap', { method: 'POST', body: ticket, headers: { origin: `http://${portal}` } })).status).toBe(401)
    const aliceHost = `alice.${instance}.localhost:${app.port}`
    expect((await call(portal, '/launch/alice', { method: 'POST', headers: { cookie: admin, origin: `http://${aliceHost}` } })).status).toBe(401)
    const launch = await call(portal, '/launch/alice', { method: 'POST', headers: { cookie: admin, origin: `http://${portal}` } })
    const url = new URL((await launch.json()).url)
    const aliceTicket = url.hash.slice(1)
    expect(url.host).toBe(aliceHost)
    const exchange = await call(aliceHost, '/_experience/exchange', { method: 'POST', body: aliceTicket, headers: { origin: url.origin } })
    expect(exchange.status).toBe(200)
    const session = exchange.headers.get('set-cookie')!.split(';')[0]!
    const native = await call(aliceHost, '/', { headers: { cookie: session } })
    expect(native.status).toBe(200)
    expect(await native.text()).toMatch(/^native=/)
    expect(native.headers.get('set-cookie')).toBeNull()
    expect((await call(`bob.${instance}.localhost:${app.port}`, '/', { headers: { cookie: session } })).status).toBe(403)
    expect((await call(aliceHost, '/')).status).toBe(401)
    const upgradeStatus = await new Promise<number>(resolve => {
      const req = request(base + '/api/remote.mux', { headers: { host: aliceHost, origin: `http://${aliceHost}`, connection: 'Upgrade', upgrade: 'websocket' } })
      req.on('response', response => { response.resume(); resolve(response.statusCode!) }); req.end()
    })
    expect(upgradeStatus).toBe(401)
    expect(starts).toBe(1)
  } finally { await app.close(); backend.closeAllConnections(); await new Promise<void>(resolve => backend.close(() => resolve())); await rm(directory, { recursive: true, force: true }) }
})
