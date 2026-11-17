import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:https'
import { once } from 'node:events'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** Exercise the installed CLI's actual signal forwarding during partial OIDC startup. */
export async function verifyPlatformShutdown(cli, directory) {
  const cert = join(directory, 'ca.pem'), key = join(directory, 'key.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key,
    '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' })
  let discovered
  const discovery = new Promise((resolve) => { discovered = resolve })
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, () => { discovered() })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const config = {
    runtime: { kubernetes: { server: 'https://cluster.test', caFile: '/unused/ca', tokenFile: '/unused/token' },
      namespacePrefix: 'env', platformNamespace: 'platform', domain: 'env.example.test', image: `env@sha256:${'a'.repeat(64)}`,
      storage: { storageClassName: 'standard', size: '1Gi' },
      resources: { requests: { cpu: '100m', memory: '256Mi' }, limits: { cpu: '1', memory: '1Gi' } } },
    oidc: { issuer: `https://localhost:${server.address().port}`, clientId: 'private-fixture-marker',
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
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  const exited = once(child, 'exit')
  let timer
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Platform shutdown smoke timed out')), 15_000) })
  try {
    await Promise.race([discovery, exited.then(() => { throw new Error('Platform exited before discovery: ' + output) }), deadline])
    child.kill('SIGTERM')
    const [code, signal] = await Promise.race([exited, deadline])
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
    await new Promise(resolve => server.close(resolve))
  }
}
