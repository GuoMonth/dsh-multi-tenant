// The container has its own internal Docker network; the test runner exposes a loopback relay.
import { createServer, connect } from 'node:net'
import { spawn } from 'node:child_process'
// DSH stays on its supported loopback listener. This byte relay exposes it only
// to the container's private network / host-loopback test relay.
const relay = createServer(socket => {
  const upstream = connect(3081, '127.0.0.1')
  socket.pipe(upstream).pipe(socket)
  socket.on('error', () => upstream.destroy())
  upstream.on('error', () => socket.destroy())
  socket.on('close', () => upstream.destroy())
})
relay.listen(3080, '0.0.0.0')
const child = spawn(process.execPath, [
  '/opt/probe/node_modules/@deepseek-ai/dsh/lib/bin.js', '--profile', 'web',
  '--patch', '/fixtures/profile.patch.yml', '--host', '127.0.0.1', '--port', '3081', '--no-open',
], { stdio: 'inherit', env: process.env })
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal))
child.on('exit', (code, signal) => { relay.close(); process.exitCode = code ?? (signal ? 1 : 0) })
