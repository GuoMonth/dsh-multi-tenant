import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { timingSafeEqual } from 'node:crypto'

// A private transport for Docker Desktop: even the native token-exchange route
// requires the already-exchanged host cookie. Never expose raw DSH on a host port.
export async function createAuthenticatedRelay(endpoint, cookie, port = 3082) {
  const target = new URL(endpoint)
  const allowed = req => {
    const received = Buffer.from(req.headers.cookie ?? '')
    const expected = Buffer.from(cookie)
    return received.length === expected.length && timingSafeEqual(received, expected)
  }
  const sockets = new Set()
  const server = createServer((req, res) => {
    if (!allowed(req)) { res.writeHead(401).end(); return }
    const upstream = request(target, { method: req.method, path: req.url, headers: { ...req.headers, host: target.host, origin: target.origin } }, response => {
      res.writeHead(response.statusCode, response.headers)
      response.pipe(res)
    })
    upstream.on('error', () => res.destroy())
    res.on('close', () => upstream.destroy())
    req.pipe(upstream)
  })
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  server.on('upgrade', (req, socket, head) => {
    if (!allowed(req)) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return }
    const upstream = connect(Number(target.port), target.hostname)
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
    socket.on('close', () => upstream.destroy())
    upstream.on('close', () => socket.destroy())
    upstream.on('connect', () => {
      const headers = { ...req.headers, host: target.host, origin: target.origin }
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(headers).map(([k,v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`)
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve) })
  return async () => { for (const socket of sockets) socket.destroy(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}
