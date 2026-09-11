import { readFileSync } from 'node:fs'
import { writeFile, rename, chmod } from 'node:fs/promises'
import { createServer, connect } from 'node:net'
import { join } from 'node:path'

// Internal profile asset. The server supplies the manifest from its pinned installation.
// No launcher internals, scope bindings or business RPC handlers are replaced.
export const name = 'domain-runtime-control'
export const inject = ['appReady', 'appExit', 'webServer', 'connection']
export function apply(ctx, config) {
  const control = process.env.DSH_CONTROL_DIR
  if (!process.send && !control) throw new Error('Domain runtime requires its coordinator control channel')
  const manifest = JSON.parse(readFileSync(config.runtimeManifest, 'utf8'))
  if (manifest.name !== '@deepseek-ai/dsh' || typeof manifest.version !== 'string') {
    throw new Error('Invalid native runtime manifest')
  }
  const domainId = process.env.DSH_DOMAIN_ID
  const generation = Number(process.env.DSH_RUNTIME_GENERATION)
  if (!domainId || !Number.isSafeInteger(generation) || generation < 1) throw new Error('Missing runtime identity')
  ctx.effect(() => ctx.appReady.onReady(() => {
    const endpoint = `http://${ctx.webServer.host}:${ctx.webServer.port}`
    // Public Connection API performs its own exchange. No log scraping or signing-secret access.
    void (async () => {
      const response = await fetch(ctx.connection.authenticatedUrl(endpoint), { redirect: 'manual', signal: AbortSignal.timeout(5_000) })
      const cookie = response.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
      await response.arrayBuffer()
      if (response.status !== 303 || !cookie) throw new Error('Native browser authentication exchange failed')
      const ready = {
        type: 'runtime-ready', domainId, generation, version: manifest.version, endpoint,
        authentication: { cookie },
      }
      if (control) {
        const sockets = new Set()
        const relay = createServer(socket => {
          sockets.add(socket)
          const target = connect(ctx.webServer.port, ctx.webServer.host)
          socket.on('error', () => target.destroy())
          target.on('error', () => socket.destroy())
          target.once('close', () => socket.destroy())
          socket.once('close', () => { sockets.delete(socket); target.destroy() })
          socket.pipe(target).pipe(socket)
        })
        ctx.effect(() => () => {
          for (const socket of sockets) socket.destroy()
          return new Promise((resolve, reject) => relay.close(error => error ? reject(error) : resolve()))
        }, 'domain runtime: private Unix transport')
        const socketPath = join(control, 'http.sock')
        await new Promise((resolve, reject) => { relay.once('error', reject); relay.listen(socketPath, resolve) })
        await chmod(socketPath, 0o600)
        const temporary = join(control, 'ready.tmp')
        await writeFile(temporary, JSON.stringify(ready), { mode: 0o600 })
        await rename(temporary, join(control, 'ready.json'))
      } else process.send(ready, error => { if (error) ctx.appExit(1) })
    })().catch(() => ctx.appExit(1))
  }), 'domain runtime: native application readiness')
  ctx.effect(() => {
    const disconnected = () => ctx.appExit(1)
    process.once('disconnect', disconnected)
    return () => process.off('disconnect', disconnected)
  }, 'domain runtime: coordinator disconnect')
}
