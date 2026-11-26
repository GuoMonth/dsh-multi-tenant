import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:https'
import { once } from 'node:events'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** Exercise the installed CLI's actual signal forwarding during partial OIDC startup. */
export async function verifyPlatformShutdown(cli: string, directory: string): Promise<void> {
  const cert = join(directory, 'ca.pem'), key = join(directory, 'key.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key,
    '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' })
  const discovery = Promise.withResolvers<void>()
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, () => { discovery.resolve() })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const adapter = join(directory, 'test-adapter.mjs')
  writeFileSync(adapter, `import { ENVIRONMENT_CONTRACT_VERSION } from 'dsh-multi-tenant'
export const contractVersion = ENVIRONMENT_CONTRACT_VERSION
export function createRuntime(options, { siteDomain }) {
  if (options.marker !== 'fixture' || siteDomain !== 'example.test') throw new Error('invalid fixture options')
  const unavailable = () => { throw new Error('fixture runtime was called before OIDC startup') }
  return { create: unavailable, inspectAllocation: unavailable, inspect: unavailable, connect: unavailable,
    stop: unavailable, start: unavailable, delete: unavailable }
}`)
  const config = {
    runtime: { modulePath: adapter, options: { marker: 'fixture' } },
    oidc: { issuer: `https://localhost:${address.port}`, clientId: 'private-fixture-marker',
      platformOrigin: 'https://platform.example.test', siteDomain: 'example.test' },
    stateFile: join(directory, 'state.sqlite'), adminSocket: join(directory, 'admin.sock'),
    members: [], host: '127.0.0.1', port: 12345,
  }
  const filename = join(directory, 'platform.json')
  writeFileSync(filename, JSON.stringify(config), { mode: 0o600 })
  const child = spawn(process.execPath, [cli, 'start', '--config', filename], {
    env: { ...process.env, NODE_EXTRA_CA_CERTS: cert }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => { output += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { output += chunk })
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('exit', (code, signal) => { resolve({ code, signal }) })
  })
  const deadline = Promise.withResolvers<never>()
  const timer = setTimeout(() => { deadline.reject(new Error('Platform shutdown smoke timed out')) }, 15_000)
  try {
    await Promise.race([discovery.promise, exited.then(() => { throw new Error('Platform exited before discovery: ' + output) }), deadline.promise])
    child.kill('SIGTERM')
    const { code, signal } = await Promise.race([exited, deadline.promise])
    assert.equal(code, 0, output)
    assert.equal(signal, null)
    assert.doesNotMatch(output, /PlatformStartupRejected|PlatformShutdownFailed|private-fixture-marker/)
    const db = new DatabaseSync(config.stateFile)
    try { db.exec('BEGIN EXCLUSIVE; ROLLBACK') } finally { db.close() }
    console.log('Installed CLI SIGTERM during OIDC discovery settled and released private SQLite')
  } finally {
    clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited }
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) })
  }
}
