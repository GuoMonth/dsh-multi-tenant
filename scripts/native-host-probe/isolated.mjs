import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, readlink, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { randomUUID, createHash } from 'node:crypto'
import { chromium } from 'playwright'
import WebSocket from 'ws'
import { installArtifact, repositoryRoot } from '../installed-package.mjs'
const installed = installArtifact()
const { SQLiteDomainRepository, DomainRuntimeCoordinator, DockerRuntimeProvider, createDomainIngress, MemoryDomainSessions } =
  await import(new URL(`file://${installed.packageDirectory}/dist/index.mjs`))

const exec = promisify(execFile)
const docker = async args => (await exec('docker', args, { maxBuffer: 2_000_000 })).stdout.trim()
let image
try {
  if (!process.env.PROBE_IMAGE) await exec('docker', ['build', '--build-context', `domain-package=${installed.packageDirectory}`,
    '-f', 'scripts/native-host-probe/Dockerfile.runtime', '-t', 'dsh-runtime-wp4-probe', '.'], { cwd: repositoryRoot, maxBuffer: 4_000_000 })
  image = process.env.PROBE_IMAGE ?? await docker(['image', 'inspect', 'dsh-runtime-wp4-probe', '--format', '{{.Id}}'])
} catch (error) { installed.close(); throw error }
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
const report = { consumer: 'installed tarball, including native control asset', authority: '(tenantId, principalId); no independent root grants', dsh: '0.1.5-rc.2', checks: [], measurements: {}, passed: false }
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
  const address = typeof sessionId === 'string' ? { kind: 'session', sessionId } : sessionId
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
        payload: { args: { request: { address } } } }))
    })
  } finally { socket.terminate() }
}
async function until(description, operation) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const value = await operation()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timeout: ${description}`)
}
async function prompt(domain, sessionId, text) {
  return rpc(domain, 'session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text }] } })
}
async function childPrompt(domain, parentSessionId, childSessionId, text) {
  return rpc(domain, 'subagents/prompt', { request: { parentSessionId, childSessionId, requestId: randomUUID(), mode: 'continuable', delivery: 'queue', content: [{ type: 'text', text }] } })
}
async function waitText(domain, address, text) {
  return until(text, async () => { const value = await snapshot(domain, address); return value.includes(text) && value })
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
    const preset = [
      { id: 'principal-mcp', name: '@deepseek-ai/dsh-mcp-client', config: { transport: 'stdio', serverName: 'principal', command: '/usr/local/bin/node',
        args: ['/opt/dsh/fixtures/mcp.mjs'], env: { PROBE_PACKAGE_ROOT: '/opt/dsh/package.json', PROBE_MARKER: '/domain/identity.txt', PROBE_STUBBORN: '1' }, reconnect: { enabled: false } } },
      { id: 'delegate', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'probe_delegate', backgroundMode: 'continuable' } },
      { id: 'restricted', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'probe_restricted', backgroundMode: 'continuable', toolFilter: { allow: [] } } },
      { id: 'fork', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'fork', toolName: 'probe_fork', backgroundMode: 'one-shot', enableRunInBackground: false } },
    ]
    await writeFile(join(profile, 'presets', 'probe', 'agent.cordis.yml'), JSON.stringify(preset))
    await mkdir(join(profile, 'presets', 'probe-alt'), { recursive: true })
    await writeFile(join(profile, 'presets', 'probe-alt', 'agent.cordis.yml'), JSON.stringify(preset))
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
  await prompt(a, '00000000-0000-4000-8000-000000000001', 'PROBE_DELEGATE')
  const catalog = await until('native child catalog', async () => {
    const value = await rpc(a, 'subagents/list', { parentSessionId: '00000000-0000-4000-8000-000000000001' })
    return value.entries.length && value
  })
  const child = catalog.entries.find(entry => entry.kind === 'child')
  const childAddress = { kind: 'subagent', mode: 'continuable', parentSessionId: '00000000-0000-4000-8000-000000000001', childSessionId: child.id }
  await waitText(a, childAddress, 'PRIVATE_alice')
  await childPrompt(a, '00000000-0000-4000-8000-000000000001', child.id, 'PROBE_DELEGATE')
  const grandchildren = await until('grandchild', async () => {
    const value = await rpc(a, 'subagents/list', { parentSessionId: child.id })
    return value.entries.length && value.entries
  })
  await waitText(a, { kind: 'subagent', mode: 'continuable', parentSessionId: child.id, childSessionId: grandchildren[0].id }, 'PRIVATE_alice')
  report.checks.push('native continuable child and grandchild inherit the domain preset MCP')
  await prompt(a, '00000000-0000-4000-8000-000000000001', 'PROBE_RESTRICT')
  const restricted = await until('restricted child', async () => {
    const value = await rpc(a, 'subagents/list', { parentSessionId: '00000000-0000-4000-8000-000000000001' })
    return value.entries.find(entry => entry.label === 'restricted probe child')
  })
  const restrictedAddress = { kind: 'subagent', mode: 'continuable', parentSessionId: '00000000-0000-4000-8000-000000000001', childSessionId: restricted.id }
  await waitText(a, restrictedAddress, 'FILTER_OK')
  await childPrompt(a, '00000000-0000-4000-8000-000000000001', restricted.id, 'PROBE_FORCE_IDENTITY')
  const denied = await waitText(a, restrictedAddress, 'unknown tool')
  assert.ok(!JSON.stringify(denied).includes('PRIVATE_alice'))
  report.checks.push('native child toolFilter removes MCP schemas and rejects forced tool execution')
  await prompt(a, '00000000-0000-4000-8000-000000000001', 'PROBE_FORK')
  const fork = await until('one-shot fork', async () => {
    const value = await rpc(a, 'subagents/list', { parentSessionId: '00000000-0000-4000-8000-000000000001' })
    return value.entries.find(entry => entry.mode === 'one-shot')
  })
  await waitText(a, { kind: 'subagent', mode: 'one-shot', parentSessionId: '00000000-0000-4000-8000-000000000001', childSessionId: fork.id }, 'PRIVATE_alice')
  report.checks.push('native one-shot fork resolves the domain preset MCP')
  await rpc(a, 'session/create', { request: { cwd: '/domain/workspace', sessionId: '00000000-0000-4000-8000-000000000002', agentPreset: 'probe' } })
  await rpc(a, 'agentPresets/select', { agentId: '00000000-0000-4000-8000-000000000002', agentPreset: 'probe-alt' })
  await prompt(a, '00000000-0000-4000-8000-000000000002', 'PROBE_IDENTITY')
  await waitText(a, { kind: 'session', sessionId: '00000000-0000-4000-8000-000000000002' }, 'PRIVATE_alice')
  report.checks.push('native blank-session preset switching retains the domain MCP')

  const secretRef = 'PROBE_DOMAIN_SECRET'
  await rpc(a, 'credentials/set', { ref: secretRef, value: 'FAKE_ALICE_SECRET_V1' })
  assert.equal((await rpc(a, 'credentials/describe', { refs: [secretRef] }))[secretRef].configured, true)
  assert.equal((await rpc(b, 'credentials/describe', { refs: [secretRef] }))[secretRef].configured, false)
  const settings = await rpc(a, 'settings/describe', {})
  assert.ok(!JSON.stringify(settings).includes('FAKE_ALICE_SECRET'))
  assert.equal(await rpc(a, 'settings/canOpenAgentPresetDirectory', {}), false)
  await rpc(a, 'credentials/set', { ref: secretRef, value: 'FAKE_ALICE_SECRET_V2' })
  await rpc(a, 'credentials/unset', { ref: secretRef })
  assert.equal((await rpc(a, 'credentials/describe', { refs: [secretRef] }))[secretRef].configured, false)
  report.checks.push('Native settings/credentials remain domain-owned; same credential reference does not cross domains; no desktop opener')
  const uploadStarted = performance.now()
  const binary = Buffer.alloc(2 * 1024 * 1024, 0x91)
  const uploaded = await fetch(`${a.origin}/api/session/uploadFileBinary?sessionId=${sessionId}&name=probe.bin`, {
    method: 'POST', headers: { ...a.headers, 'content-type': 'application/octet-stream' }, body: binary,
  })
  assert.equal(uploaded.status, 200)
  const uploadedResult = await uploaded.json()
  assert.equal(uploadedResult.ok, true, JSON.stringify(uploadedResult))
  assert.equal(uploadedResult.value.file.bytes, binary.length)
  report.measurements.binaryUpload2MiBMs = Math.round(performance.now() - uploadStarted)
  report.checks.push('Installed ingress carries a real 2 MiB native upload')
  const warmStarted = performance.now()
  const warm = await Promise.all(Array.from({ length: 40 }, () => coordinator.ensure(a.owner)))
  assert.ok(warm.every(value => value.generation === admissions[0].generation))
  report.measurements.fortyWarmAdmissionsMs = Math.round(performance.now() - warmStarted)
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
  // A workload may replace its transport path, but the platform connects to the captured inode.
  await docker(['exec', container.Id, 'node', '-e', `
    const fs=require('node:fs'); fs.renameSync('/control/http.sock','/control/original.sock');
    fs.symlinkSync('/var/run/docker.sock','/control/http.sock');
    if (!fs.readFileSync('/domain/mcp-descendants.txt','utf8').trim()) process.exit(3);
  `])
  const afterReplacement = await fetch(`${a.origin}/api/file?path=/domain/identity.txt`, { headers: a.headers })
  assert.equal(await afterReplacement.text(), 'PRIVATE_alice')
  report.checks.push('A workload socket symlink cannot redirect platform connections; MCP has an independently detached descendant')
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
    const reconnectStarted = performance.now()
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
    report.measurements[`${domain.owner.principalId}BrowserReconnectMs`] = Math.round(performance.now() - reconnectStarted)
    assert.deepEqual(pageErrors, [])
    await writeFile(join(root, `${domain.owner.principalId}.txt`), await page.locator('body').innerText())
    await page.screenshot({ path: join(root, `${domain.owner.principalId}.png`), fullPage: true })
    await context.close()
  }
  report.checks.push('Official Web sends native tool calls and reconnects through authenticated isolated ingress')
  const frameServer = createServer((_request, response) => response.end(`<iframe src="${a.origin}"></iframe>`))
  const frameContext = await browser.newContext()
  try {
    await frameContext.addCookies([{ name: 'domain-session', value: a.token, url: a.origin }])
    frameServer.listen(0, '127.0.0.1')
    await once(frameServer, 'listening')
    const framePage = await frameContext.newPage()
    const messages = []
    framePage.on('console', message => messages.push(message.text()))
    await framePage.goto(`http://127.0.0.1:${frameServer.address().port}`)
    await until('cross-origin frame rejection', async () => messages.some(message => message.includes('frame-ancestors')))
    report.checks.push('A real browser refuses cross-origin framing of an authenticated native Host')
  } finally {
    await frameContext.close()
    await new Promise(resolve => frameServer.close(resolve))
  }

  const replacementStarted = performance.now()
  await coordinator.setDesired(a.record.id, 'suspended')
  await assert.rejects(coordinator.ensure(a.owner), /not enabled/)
  assert.equal((await fetch(a.origin, { headers: a.headers })).status, 503)
  await coordinator.setDesired(a.record.id, 'enabled')
  const restarted = await coordinator.ensure(a.owner)
  assert.ok(restarted.generation > admissions[0].generation)
  report.measurements.suspendAndRestartMs = Math.round(performance.now() - replacementStarted)
  await waitText(a, childAddress, 'PRIVATE_alice')
  await prompt(a, sessionId, 'PROBE_AFTER_RESTART')
  await waitText(a, sessionId, 'PROBE_REPLY undefined PROBE_AFTER_RESTART')
  await childPrompt(a, sessionId, child.id, 'PROBE_IDENTITY cold-continuation')
  await waitText(a, childAddress, 'PROBE_RESULT PROBE_IDENTITY cold-continuation')
  await childPrompt(a, sessionId, restricted.id, 'PROBE_FORCE_IDENTITY_AFTER_RESTART')
  const coldDenied = await waitText(a, restrictedAddress, 'PROBE_RESULT PROBE_FORCE_IDENTITY_AFTER_RESTART')
  assert.ok(coldDenied.includes('unknown tool') && !coldDenied.includes('PRIVATE_alice'))
  report.checks.push('Native cold continuations preserve MCP composition and toolFilter after generation replacement')
  // Boundary regression: same-Principal history remains readable; no root grants promised.
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
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, PROBE_INSTALLED_ENTRY: `${installed.packageDirectory}/dist/index.mjs`, PROBE_DOCKER_CONFIG: JSON.stringify(crashConfig) },
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
  const revokeStarted = performance.now()
  await coordinator.setDesired(a.record.id, 'revoked')
  report.measurements.domainRevokeMs = Math.round(performance.now() - revokeStarted)
  assert.equal(admissions[0].signal.aborted, true)
  assert.equal(admissions[1].signal.aborted, false)
  assert.equal((await fetch(b.origin, { headers: b.headers })).status, 200)
  await coordinator.close()
  const reopened = new SQLiteDomainRepository(join(root, 'directory'))
  try {
    assert.equal(reopened.get(a.record.id).desired, 'revoked')
    assert.throws(() => reopened.begin(a.record.id), /disabled/)
    assert.throws(() => reopened.setDesired(a.record.id, 'enabled'), /cannot be re-enabled/)
  } finally { reopened.close() }
  report.checks.push('Login revocation closes an existing native mux; domain revocation preserves the other domain and rejects after directory restart')
} catch (error) { failure = error }
finally {
  const results = await Promise.allSettled([browser?.close(), ...domains.map(domain => domain.ingress.close())])
  sessions.close()
  try { await coordinator.close() } catch (error) { results.push({ status: 'rejected', reason: error }) }
  try {
    const owner = createHash('sha256').update(await realpath(runtimeDirectory)).digest('hex').slice(0, 16)
    assert.equal(await docker(['container', 'ls', '-a', '--filter', `label=dsh.owner=${owner}`, '--format', '{{.ID}}']), '')
    const descriptors = await Promise.all((await readdir('/proc/self/fd')).map(name => readlink(`/proc/self/fd/${name}`).catch(() => '')))
    assert.equal(descriptors.filter(value => value.startsWith(runtimeDirectory)).length, 0)
    report.checks.push('Cleanup leaves no owned container (including detached MCP descendants) or pinned runtime descriptor')
  } catch (error) { results.push({ status: 'rejected', reason: error }) }
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
  if (errors.length) failure = new AggregateError([...(failure ? [failure] : []), ...errors], 'Isolated proof cleanup failed')
  if (!failure) { await rm(runtimeDirectory, { recursive: true, force: true }); await rm(profiles, { recursive: true, force: true }) }
  report.passed = !failure
  if (failure) report.error = String(failure)
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  installed.close()
  console.log(`Isolated native ingress evidence: ${root}`)
}
if (failure) throw failure
console.log(JSON.stringify(report, null, 2))
