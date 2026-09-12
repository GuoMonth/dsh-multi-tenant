import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { createAuthenticatedRelay } from '../../packages/multi-tenant/src/native/tcp-relay.mjs'

test('the Desktop relay gates every HTTP and upgrade path before native DSH', async () => {
  let calls = 0
  const native = createServer((req, res) => { calls++; res.end('native') })
  native.listen(0, '127.0.0.1'); await once(native, 'listening')
  // Reserve a port for this bounded single-process test.
  const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening')
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve))
  const close = await createAuthenticatedRelay(`http://127.0.0.1:${native.address().port}`, 'private=host-only', port)
  try {
    for (const path of ['/', '/?token=forged', '/api/file?path=/etc/passwd']) assert.equal((await fetch(`http://127.0.0.1:${port}${path}`)).status, 401)
    const status = await new Promise(resolve => {
      const req = request(`http://127.0.0.1:${port}/api/remote.mux`, { headers: { connection: 'Upgrade', upgrade: 'websocket' } })
      req.on('response', res => { res.resume(); resolve(res.statusCode) }); req.end()
    })
    assert.equal(status, 401); assert.equal(calls, 0)
    assert.equal(await (await fetch(`http://127.0.0.1:${port}/`, { headers: { cookie: 'private=host-only' } })).text(), 'native')
    assert.equal(calls, 1)
  } finally { await close(); native.closeAllConnections(); await new Promise(resolve => native.close(resolve)) }
})

test('demo MCP responds to an invalid tool instead of leaving a native call hanging', async () => {
  const { spawn } = await import('node:child_process')
  const child = spawn(process.execPath, ['packages/multi-tenant/experience/mcp.mjs'], { stdio: ['pipe','pipe','pipe'] })
  try {
    const response = once(child.stdout, 'data')
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'unknown'}})+'\n')
    const [bytes] = await response
    const message = JSON.parse(String(bytes))
    assert.equal(message.id,7)
    assert.equal(message.error.code,-32603)
    assert.ok(!message.error.message.includes('node:'))
  } finally { child.stdin.end(); await once(child,'exit') }
})
