import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import WebSocket from 'ws'
import { SQLiteDomainRepository } from '../../packages/multi-tenant/src/domain/sqlite.ts'
import { DomainRuntimeCoordinator } from '../../packages/multi-tenant/src/runtime/coordinator.ts'
import { DockerRuntimeProvider } from '../../packages/multi-tenant/src/runtime/providers/docker.ts'
import { createDomainIngress } from '../../packages/multi-tenant/src/ingress/server.ts'
import { MemoryDomainSessions } from '../../packages/multi-tenant/src/ingress/authentication.ts'

const exec = promisify(execFile)
const docker = async args => (await exec('docker', args, { maxBuffer: 2_000_000 })).stdout.trim()
const image = process.env.PROBE_IMAGE ?? await docker(['image', 'inspect', 'dsh-runtime-wp4-probe', '--format', '{{.Id}}'])
const evidenceParent = process.env.PROBE_EVIDENCE_DIR ? resolve(process.env.PROBE_EVIDENCE_DIR) : tmpdir()
await mkdir(evidenceParent, { recursive: true, mode: 0o700 })
const root = await mkdtemp(join(evidenceParent, 'dsh-wp34-'))
const profiles = join(root, 'profiles')
const runtimeDirectory = join(root, 'runtime')
const repository = new SQLiteDomainRepository(join(root, 'directory'))
const provider = new DockerRuntimeProvider({ image, directory: runtimeDirectory, profileDirectory: id => join(profiles, id), uid: process.getuid(), gid: process.getgid() })
const coordinator = new DomainRuntimeCoordinator(repository, provider, '0.1.5-rc.2', 45_000, 20_000)
const sessions = new MemoryDomainSessions('domain-session')
const origins = new Map()
const domains = []
let browser
const report = { dsh: '0.1.5-rc.2', checks: [], measurements: {}, passed: false }
let failure
async function rpc(domain, method, args) {
  const response = await fetch(`${domain.origin}/api/${method}`, { method: 'POST', headers: { ...domain.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }) })
  assert.equal(response.status, 200)
  const envelope = await response.json()
  assert.equal(envelope.result.ok, true, JSON.stringify(envelope.result.error))
  return envelope.result.value
}
async function snapshot(domain, sessionId) {
  const socket = new WebSocket(domain.origin.replace('http:', 'ws:') + '/api/remote.mux', { headers: domain.headers })
  try {
    await once(socket, 'open')
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('snapshot timeout')); socket.terminate() }, 10_000)
      socket.on('error', error => { clearTimeout(timer); reject(error) })
      socket.on('message', bytes => {
        const value = JSON.parse(String(bytes))
        if (value.type === 'item') { clearTimeout(timer); resolve(JSON.stringify(value.value)) }
        if (value.type === 'error') { clearTimeout(timer); reject(new Error(JSON.stringify(value))) }
      })
      socket.send(JSON.stringify({ type: 'open', streamId: 'probe', endpoint: 'session/follow',
        payload: { args: { request: { address: { kind: 'session', sessionId } } } } }))
    })
  } finally { socket.terminate() }
}
try {
  for (const principalId of ['alice', 'bob']) {
    const owner = { tenantId: 'probe', principalId }
    const record = repository.resolve(owner)
    const profile = join(profiles, record.id)
    const data = join(runtimeDirectory, 'data', record.id)
    await mkdir(join(profile, 'presets', 'probe'), { recursive: true })
    await mkdir(join(data, 'workspace'), { recursive: true })
    await writeFile(join(data, 'identity.txt'), `PRIVATE_${principalId}`)
    await writeFile(join(profile, 'presets', 'probe', 'agent.cordis.yml'), JSON.stringify([
      { id: 'principal-mcp', name: '@deepseek-ai/dsh-mcp-client', config: { transport: 'stdio', serverName: 'principal', command: '/usr/local/bin/node',
        args: ['/opt/dsh/fixtures/mcp.mjs'], env: { PROBE_PACKAGE_ROOT: '/opt/dsh/package.json', PROBE_MARKER: '/domain/identity.txt' }, reconnect: { enabled: false } } },
      { id: 'delegate', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'probe_delegate', backgroundMode: 'continuable' } },
    ]))
    await writeFile(join(profile, 'runtime.patch.json'), JSON.stringify([
      { id: 'web-runtime', config: { printUrl: false, openBrowser: false } },
      ...['llm-deepseek', 'llm-pi-ai', 'session-title-llm', 'session-telemetry-otel'].map(id => ({ id, disabled: true })),
      { id: 'agent-default-model', config: { provider: 'probe', model: 'probe' } },
      { id: 'session-query-sqlite', config: { path: '/domain/query.sqlite', openAt: 'first-search' } },
      { id: 'agent-presets', config: { default: 'probe', includeUserRoot: false, includeShippedRoot: true, roots: [{ path: '/profile/presets', trust: 'system' }] } },
      { insert: [
        { id: 'domain-runtime-control', name: '/opt/dsh/runtime-control.mjs', config: { runtimeManifest: '/opt/dsh/node_modules/@deepseek-ai/dsh/package.json' } },
        { id: 'probe-model', name: '/opt/dsh/fixtures/model.mjs' },
      ] },
    ]))
    const ingress = createDomainIngress({ authenticator: sessions, runtime: coordinator, originFor: identity => origins.get(identity.principalId) })
    const domain = { owner, record, ingress }
    domains.push(domain)
    ingress.server.listen(0, '127.0.0.1')
    await once(ingress.server, 'listening')
    domain.origin = `http://127.0.0.1:${ingress.server.address().port}`
    origins.set(principalId, domain.origin)
    domain.token = sessions.issue(owner)
    domain.headers = { cookie: `domain-session=${domain.token}`, origin: domain.origin }
  }
  const started = performance.now()
  const admissions = await Promise.all(domains.map(domain => coordinator.ensure(domain.owner)))
  report.measurements.twoColdHostsMs = Math.round(performance.now() - started)
  report.checks.push('Two isolated native hosts are admitted through private Unix sockets without network ports')
  const sessionId = '00000000-0000-4000-8000-000000000001'
  for (const domain of domains) {
    const rootResponse = await fetch(domain.origin, { headers: domain.headers })
    assert.equal(rootResponse.status, 200)
    assert.equal(rootResponse.headers.get('set-cookie'), null)
    assert.match(await rootResponse.text(), /__DSH_BOOT__/)
    const workspace = await rpc(domain, 'workspace/create', { request: { path: '/domain/workspace' } })
    await rpc(domain, 'session/create', { request: { sessionId, workspaceId: workspace.workspace.workspaceId, agentPreset: 'probe' } })
    await rpc(domain, 'session/rename', { request: { sessionId, title: `${domain.owner.principalId.toUpperCase()}_ROOT` } })
    await rpc(domain, 'session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'PROBE_IDENTITY' }] } })
    let state
    for (let attempt = 0; attempt < 100; attempt++) {
      state = await snapshot(domain, sessionId)
      if (state.includes(`PRIVATE_${domain.owner.principalId}`)) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.match(state, new RegExp(`PRIVATE_${domain.owner.principalId}`))
    const response = await fetch(`${domain.origin}/api/file?path=/domain/identity.txt`, { headers: domain.headers })
    assert.equal(await response.text(), `PRIVATE_${domain.owner.principalId}`)
  }
  const [a, b] = domains
  assert.equal((await fetch(b.origin, { headers: a.headers })).status, 403)
  assert.equal((await fetch(a.origin, { headers: { ...a.headers, origin: b.origin } })).status, 403)
  report.checks.push('Native HTML, RPC, mux and MCP work; same Session/tool/path resolve only the authenticated domain')
  const containers = JSON.parse(await docker(['container', 'inspect', ...(await docker(['container', 'ls', '--filter', `label=dsh.domain=${a.record.id}`, '--format', '{{.ID}}'])).split('\n')]))
  const container = containers[0]
  assert.equal(container.HostConfig.NetworkMode, 'none')
  assert.equal(container.HostConfig.ReadonlyRootfs, true)
  assert.deepEqual(container.HostConfig.CapDrop, ['ALL'])
  assert.equal(container.Config.User, `${process.getuid()}:${process.getgid()}`)
  await docker(['exec', container.Id, 'node', '-e', `
    const fs=require('node:fs'); const assert=require('node:assert/strict');
    for(const p of ['/var/run/docker.sock', ${JSON.stringify(join(root, 'directory', 'domains.sqlite'))}, ${JSON.stringify(join(runtimeDirectory, 'data', b.record.id, 'identity.txt'))}]) assert.throws(()=>fs.readFileSync(p));
    assert.throws(()=>fs.writeFileSync('/profile/runtime.patch.json','bad'));
    assert.throws(()=>fs.writeFileSync('/etc/domain-probe','bad'));
    fetch('http://1.1.1.1',{signal:AbortSignal.timeout(1000)}).then(()=>process.exit(2),()=>{});
  `])
  report.checks.push('Execution denies other-domain/platform files, Docker socket, profile/root writes and network egress')
  report.measurements.aliceContainer = await docker(['stats', '--no-stream', '--format', '{{json .}}', container.Id])
  browser = await chromium.launch({ headless: true, ...(process.env.PROBE_CHROMIUM ? { executablePath: process.env.PROBE_CHROMIUM } : {}), args: ['--no-sandbox'] })
  report.browser = browser.version()
  for (const domain of domains) {
    const context = await browser.newContext()
    await context.addCookies([{ name: 'domain-session', value: domain.token, url: domain.origin }])
    const page = await context.newPage()
    const pageErrors = []
    let websockets = 0
    page.on('pageerror', error => pageErrors.push(String(error)))
    page.on('websocket', () => { websockets++ })
    await page.goto(domain.origin)
    const welcome = page.getByRole('button', { name: 'Continue', exact: true })
    await welcome.waitFor({ state: 'visible', timeout: 10_000 })
    await welcome.click()
    await page.getByText(`${domain.owner.principalId.toUpperCase()}_ROOT`, { exact: true }).first().click()
    const composer = page.locator('[data-composer-input][contenteditable="true"]')
    await composer.fill('PROBE_IDENTITY browser')
    await composer.press('Enter')
    await page.getByText('PROBE_RESULT PROBE_IDENTITY browser', { exact: false }).first().waitFor({ timeout: 20_000 })
    const beforeReconnect = websockets
    await context.setOffline(true)
    await page.waitForTimeout(500)
    await context.setOffline(false)
    for (let attempt = 0; attempt < 100 && websockets === beforeReconnect; attempt++) await page.waitForTimeout(100)
    assert.ok(websockets > beforeReconnect, 'The browser must establish a new native mux')
    await composer.fill('PROBE_IDENTITY reconnect')
    await composer.press('Enter')
    await page.getByText('PROBE_RESULT PROBE_IDENTITY reconnect', { exact: false }).first().waitFor({ timeout: 20_000 })
    await page.getByText('Connected', { exact: true }).last().waitFor({ timeout: 20_000 })
    assert.deepEqual(pageErrors, [])
    await writeFile(join(root, `${domain.owner.principalId}.txt`), await page.locator('body').innerText())
    await page.screenshot({ path: join(root, `${domain.owner.principalId}.png`), fullPage: true })
    await context.close()
  }
  report.checks.push('Official Web sends native tool calls and reconnects through authenticated isolated ingress')
  // Challenge the proposed root boundary: a public publication veto is NOT a read authority.
  await coordinator.stop(a.record.id)
  const aProfile = join(profiles, a.record.id)
  await writeFile(join(aProfile, 'root-veto.mjs'), `
    export function apply(ctx) {
      ctx.on('session/created', session => { if (session.id === '${sessionId}') throw new Error('root permission revoked') })
    }
  `)
  const rootPatch = JSON.parse(await readFile(join(aProfile, 'runtime.patch.json'), 'utf8'))
  rootPatch.push({ insert: [{ id: 'root-publication-veto-probe', name: '/profile/root-veto.mjs' }] })
  await writeFile(join(aProfile, 'runtime.patch.json'), JSON.stringify(rootPatch))
  await coordinator.ensure(a.owner)
  const roots = await rpc(a, 'session/list', { _request: {} })
  assert.ok(JSON.stringify(roots).includes(sessionId))
  assert.ok((await snapshot(a, sessionId)).includes('PRIVATE_alice'))
  const vetoResponse = await fetch(`${a.origin}/api/session/prompt`, { method: 'POST', headers: { ...a.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: 'session/prompt', payload: { args: {
      request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'PROBE_IDENTITY denied' }] },
    } } }) })
  const veto = await vetoResponse.json()
  assert.equal(veto.result.ok, false)
  report.rootAuthorityCounterexample = {
    publicationVetoRejectsResume: true, coldListStillVisible: true, coldHistoryStillReadable: true,
    conclusion: 'A native publication veto plus Principal Host isolation is insufficient for independent root read revocation.',
  }
  // Deliberately kill a separate coordinator while Docker retains its native Host.
  const crashDirectory = join(root, 'crash-directory')
  const crashConfig = { directory: crashDirectory, profile: join(profiles, a.record.id),
    provider: { image, directory: runtimeDirectory, uid: process.getuid(), gid: process.getgid() } }
  const requirePackage = createRequire(new URL('../../packages/multi-tenant/package.json', import.meta.url))
  const controller = spawn(process.execPath, ['--import', requirePackage.resolve('tsx'),
    fileURLToPath(new URL('../../packages/multi-tenant/tests/runtime/docker-controller.fixture.mjs', import.meta.url))], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, PROBE_DOCKER_CONFIG: JSON.stringify(crashConfig) },
  })
  const controllerExit = once(controller, 'exit')
  let recovered
  try {
    const identity = await Promise.race([once(controller, 'message').then(([message]) => message),
      controllerExit.then(() => { throw new Error('Crash fixture failed to start') })])
    controller.kill('SIGKILL')
    await controllerExit
    const orphan = await docker(['container', 'ls', '--filter', `label=dsh.domain=${identity.domainId}`, '--format', '{{.ID}}'])
    assert.ok(orphan)
    const recoveredRepository = new SQLiteDomainRepository(crashDirectory)
    recovered = new DomainRuntimeCoordinator(recoveredRepository,
      new DockerRuntimeProvider({ ...crashConfig.provider, profileDirectory: () => crashConfig.profile }), '0.1.5-rc.2', 45_000, 20_000)
    assert.equal(recoveredRepository.get(identity.domainId).unresolved, true)
    await recovered.recover(identity.domainId)
    assert.equal(await docker(['container', 'ls', '-a', '--filter', `id=${orphan}`, '--format', '{{.ID}}']), '')
    const next = await recovered.ensure({ tenantId: 'probe', principalId: 'crash' })
    assert.equal(next.generation, identity.generation + 1)
    report.checks.push('SIGKILL recovery removes the exact orphan container before reusing storage in a new generation')
  } finally {
    if (controller.exitCode === null && controller.signalCode === null) controller.kill('SIGKILL')
    await controllerExit
    await recovered?.close()
  }
  const socket = new WebSocket(a.origin.replace('http:', 'ws:') + '/api/remote.mux', { headers: a.headers })
  await once(socket, 'open')
  const closed = once(socket, 'close')
  sessions.revoke(a.token)
  await closed
  assert.equal((await fetch(a.origin, { headers: a.headers })).status, 401)
  await coordinator.setDesired(a.record.id, 'revoked')
  assert.equal(admissions[0].signal.aborted, true)
  assert.equal(admissions[1].signal.aborted, false)
  report.checks.push('Login revocation closes an existing native mux; domain revocation stops its runtime and preserves the other domain')
} catch (error) { failure = error }
finally {
  const results = await Promise.allSettled([browser?.close(), ...domains.map(domain => domain.ingress.close())])
  sessions.close()
  try { await coordinator.close() } catch (error) { results.push({ status: 'rejected', reason: error }) }
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
  if (errors.length) failure = new AggregateError([...(failure ? [failure] : []), ...errors], 'Isolated proof cleanup failed')
  if (!failure) { await rm(runtimeDirectory, { recursive: true, force: true }); await rm(profiles, { recursive: true, force: true }) }
  report.passed = !failure
  if (failure) report.error = String(failure)
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`Isolated native ingress evidence: ${root}`)
}
if (failure) throw failure
console.log(JSON.stringify(report, null, 2))
