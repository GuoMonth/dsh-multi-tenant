/** Real rc.2 Web profiles in two isolated containers; no production credentials. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, readdir, copyFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, connect } from 'node:net'
import { randomUUID } from 'node:crypto'

const exec = promisify(execFile)
const fixtures = fileURLToPath(new URL('.', import.meta.url))
const runtime = resolve(process.argv[2] ?? fixtures)
const evidence = resolve(process.argv[3] ?? new URL('../../docs/evidence/native-domain-review/multiprocess', import.meta.url).pathname)
const require = createRequire(join(runtime, 'package.json'))
const containerImage = 'node:24-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df'
const { default: WebSocket } = await import(require.resolve('ws'))
const { chromium } = require('playwright')
const prefix = `dsh-native-probe-${randomUUID().slice(0, 8)}`
const work = await mkdtemp(join(tmpdir(), prefix + '-'))
const cells = []
const results = { baseline: '0.1.5-rc.2', startedAt: new Date().toISOString(), checks: [], metrics: {}, limitations: [
  'Two preassigned Hosts: platform identity routing, logout/revocation and single-writer supervisor are not implemented.',
  'Loopback origins and separate browser contexts: production TLS, domain cookies, shared-browser account switching and ingress proxy are not verified.',
  'Keyless deterministic model and local MCP; no external provider, internet egress or MCP reconnect test.',
  'Domain capability inheritance only: per-root grants, revocation, grandchildren, fork and preset-generation changes remain unverified.',
  'Selected native Web/API flows only; no complete route inventory, settings/plugin policy or desktop capability certification.',
  'Two Node 24 containers on one Linux host; timings exclude installation and image pull, and memory is a low-load snapshot, not capacity planning.',
] }
const docker = async (...args) => (await exec('docker', args, { timeout: 120000, maxBuffer: 8 * 1024 * 1024 })).stdout.trim()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
function pass(name, details = {}) { results.checks.push({ name, status: 'passed', ...details }); console.log(`PASS ${name}`) }
async function until(get, predicate, timeout = 45000) {
  const deadline = Date.now() + timeout
  let last
  do { last = await get(); if (predicate(last)) return last; await delay(250) } while (Date.now() < deadline)
  throw new Error(`Condition timed out: ${JSON.stringify(last).slice(0, 2000)}`)
}
async function startCell(principal) {
  const started = performance.now()
  const cell = { principal, name: `${prefix}-${principal}`, network: `${prefix}-${principal}-net`, directory: join(work, principal), sockets: new Set(), streams: [] }
  cells.push(cell)
  for (const path of ['workspaces/project', 'dsh-home/profiles/web/node_modules/@deepseek-ai', 'presets/probe']) await mkdir(join(cell.directory, path), { recursive: true })
  await writeFile(join(cell.directory, 'workspaces/project/identity.txt'), `TEST_ONLY_${principal.toUpperCase()}_PRIVATE_MARKER`)
  await copyFile(join(fixtures, 'agent.cordis.yml'), join(cell.directory, 'presets/probe/agent.cordis.yml'))
  await writeFile(join(cell.directory, 'presets/probe/preset.yml'), 'name: Native host probe\ndescription: Keyless Principal capability probe\n')
  const profile = join(cell.directory, 'dsh-home/profiles/web')
  await writeFile(join(profile, 'package.json'), JSON.stringify({ private: true, dependencies: { '@deepseek-ai/dsh-base': '0.1.5-rc.2', '@deepseek-ai/dsh-web-app': '0.1.5-rc.2' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], patchReload: 'startup' } } }))
  for (const pkg of ['dsh-base', 'dsh-web-app']) await symlink(`/opt/probe/node_modules/@deepseek-ai/${pkg}`, join(profile, 'node_modules/@deepseek-ai', pkg))
  await docker('network', 'create', '--internal', '--label', `dsh-native-probe=${prefix}`, cell.network)
  cell.networkCreated = true
  await docker('run', '-d', '--name', cell.name, '--label', `dsh-native-probe=${prefix}`, '--network', cell.network,
    '--user', `${process.getuid()}:${process.getgid()}`, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', '128', '--memory', '1g', '--cpus', '1', '--tmpfs', '/tmp:rw,nosuid,size=128m',
    '--mount', `type=bind,src=${runtime},dst=/opt/probe,readonly`, '--mount', `type=bind,src=${fixtures},dst=/fixtures,readonly`,
    '--mount', `type=bind,src=${cell.directory},dst=/domain`, '-w', '/domain/workspaces/project',
    '-e', 'DSH_HOME=/domain/dsh-home', '-e', `PROBE_PRINCIPAL=${principal}`, containerImage, 'node', '/fixtures/launch.mjs')
  cell.containerCreated = true
  cell.ip = await docker('inspect', cell.name, '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
  cell.proxy = createServer(socket => {
    cell.sockets.add(socket)
    const upstream = connect(3080, cell.ip)
    socket.pipe(upstream).pipe(socket)
    socket.on('error', () => upstream.destroy()); upstream.on('error', () => socket.destroy())
    socket.on('close', () => { upstream.destroy(); cell.sockets.delete(socket) })
  })
  await new Promise(resolve => cell.proxy.listen(0, '127.0.0.1', resolve))
  cell.origin = `http://127.0.0.1:${cell.proxy.address().port}`
  await ready(cell)
  results.metrics[principal] = { coldReadyMs: Math.round(performance.now() - started) }
  return cell
}
async function ready(cell) {
  const logs = await until(async () => {
    const log = await docker('logs', cell.name)
    const running = await docker('inspect', cell.name, '--format', '{{.State.Running}}')
    if (running !== 'true') throw new Error(`Host ${cell.principal} exited: ${log.replace(/token=\S+/g, 'token=REDACTED').slice(-4000)}`)
    return log
  }, log => [...log.matchAll(/dsh web: http:\/\/[^\s]+token=([^\s]+)/g)].length > (cell.launchCount ?? 0))
  const launches = [...logs.matchAll(/dsh web: http:\/\/[^\s]+token=([^\s]+)/g)]
  cell.launchCount = launches.length
  cell.token = launches.at(-1)[1]
  const response = await fetch(`${cell.origin}/?token=${cell.token}`, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
  assert.equal(response.status, 303)
  cell.cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  assert.ok(cell.cookie)
}
async function rpc(cell, endpoint, args = {}) {
  const response = await fetch(`${cell.origin}/api/${endpoint}`, {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: cell.cookie }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint, payload: { args } }),
  })
  assert.equal(response.status, 200, `${endpoint}: HTTP ${response.status}`)
  return (await response.json()).result
}
async function value(cell, endpoint, args = {}) {
  const result = await rpc(cell, endpoint, args)
  assert.ok(result.ok, `${endpoint}: ${JSON.stringify(result)}`)
  return result.value
}
async function stream(cell, endpoint, args) {
  const socket = new WebSocket(cell.origin.replace('http:', 'ws:') + '/api/remote.mux', { headers: { Cookie: cell.cookie, Origin: cell.origin } })
  const entries = []
  socket.on('message', bytes => entries.push(JSON.parse(bytes)))
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  const id = randomUUID()
  socket.send(JSON.stringify({ type: 'open', streamId: id, endpoint, payload: { args } }))
  const handle = { entries, socket, close: () => socket.terminate() }
  cell.streams.push(handle)
  await until(() => entries, items => items.length > 0)
  return handle
}
async function snapshot(cell, address) {
  const handle = await stream(cell, 'session/follow', { request: { address, maxMessages: 100, assistantStream: true } })
  try {
    const first = handle.entries[0]
    assert.equal(first.type, 'item', JSON.stringify(first))
    assert.equal(first.value.type, 'snapshot')
    return first.value
  } finally { handle.close() }
}
async function send(cell, sessionId, text) {
  return value(cell, 'session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text }] } })
}
async function waitText(cell, address, expected) {
  return until(() => snapshot(cell, address), page => JSON.stringify(page.records).includes(expected))
}
let browser
try {
  await mkdir(evidence, { recursive: true })
  const installed = (await readdir(join(runtime, 'node_modules/.pnpm'))).filter(name => /^@deepseek-ai\+dsh(?:-|@)/.test(name))
  assert.ok(installed.length > 100, 'Expected full native profile dependencies in an isolated pnpm installation')
  assert.ok(installed.every(name => /@0\.1\.5-rc\.2(?:_|$)/.test(name)), 'Mixed DSH versions in runtime')
  results.environment = { hostNode: process.version, containerImage, installedDshPackageInstances: installed.length,
    imageId: await docker('image', 'inspect', containerImage, '--format', '{{.Id}}') }
  const a = await startCell('alice')
  const b = await startCell('bob')
  results.environment.containerNode = await docker('exec', a.name, 'node', '--version')
  pass('two native rc.2 Web profiles started in independent restricted containers')
  for (const cell of cells) {
    const noAuth = await fetch(`${cell.origin}/api/session/list`, { method: 'POST' })
    assert.equal(noAuth.status, 401)
    const wrongOrigin = await fetch(`${cell.origin}/api/session/list`, { method: 'POST', headers: { Cookie: cell.cookie, Origin: 'https://untrusted.invalid' } })
    assert.equal(wrongOrigin.status, 403)
    const other = cell === a ? b : a
    const wrongCookie = cell.cookie.split('=')[0] + '=' + other.cookie.slice(other.cookie.indexOf('=') + 1)
    const crossCookie = await fetch(`${cell.origin}/api/session/list`, { method: 'POST', headers: { Cookie: wrongCookie } })
    assert.equal(crossCookie.status, 401)
    const created = await value(cell, 'session/create', { request: { cwd: '/domain/workspaces/project', agentPreset: 'probe' } })
    cell.sessionId = created.sessionId
    cell.address = { kind: 'session', sessionId: created.sessionId }
    assert.equal(created.agentPreset, 'probe')
    cell.events = await stream(cell, '$events', {})
    await send(cell, cell.sessionId, 'PROBE_IDENTITY')
    const page = await waitText(cell, cell.address, `TEST_ONLY_${cell.principal.toUpperCase()}_PRIVATE_MARKER`)
    await writeFile(join(evidence, `${cell.principal}-initial-history.json`), JSON.stringify(page, null, 2))
    pass(`${cell.principal}: native auth, real preset, real MCP identity and persisted history`)
  }
  for (const cell of cells) {
    const other = cell === a ? b : a
    const listed = await value(cell, 'session/list', { _request: {} })
    assert.ok(JSON.stringify(listed).includes(cell.sessionId)); assert.ok(!JSON.stringify(listed).includes(other.sessionId))
    await until(() => value(cell, 'session/search', { request: { query: `TEST_ONLY_${cell.principal.toUpperCase()}_PRIVATE_MARKER` } }),
      search => search.items.length > 0)
    const search = await value(cell, 'session/search', { request: { query: `TEST_ONLY_${other.principal.toUpperCase()}_PRIVATE_MARKER` } })
    assert.equal(search.items.length, 0)
    const unauthorized = await rpc(cell, 'session/prompt', { request: { sessionId: other.sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'forged cross-domain' }] } })
    assert.equal(unauthorized.ok, false)
    const follow = await stream(cell, 'session/follow', { request: { address: other.address } })
    assert.equal(follow.entries[0].type, 'error'); follow.close()
    const ownFile = await fetch(`${cell.origin}/api/file?path=${encodeURIComponent('/domain/workspaces/project/identity.txt')}`, { headers: { Cookie: cell.cookie } })
    assert.equal(ownFile.status, 200)
    assert.equal(await ownFile.text(), `TEST_ONLY_${cell.principal.toUpperCase()}_PRIVATE_MARKER`)
    const otherFile = await fetch(`${cell.origin}/api/file?path=${encodeURIComponent(join(other.directory, 'workspaces/project/identity.txt'))}`, { headers: { Cookie: cell.cookie } })
    assert.ok([403, 404].includes(otherFile.status))
    const rawFS = await docker('exec', cell.name, 'node', '-e', `const fs=require('fs'); console.log(JSON.stringify({ own:fs.readFileSync('/domain/workspaces/project/identity.txt','utf8'), otherExists:fs.existsSync(${JSON.stringify(join(other.directory, 'workspaces/project/identity.txt'))}), dockerSocket:fs.existsSync('/var/run/docker.sock') }))`)
    assert.equal(JSON.parse(rawFS).otherExists, false); assert.equal(JSON.parse(rawFS).dockerSocket, false)
    const network = await docker('exec', cell.name, 'node', '-e', `const n=require('net');const s=n.connect(3080,${JSON.stringify(other.ip)});s.on('connect',()=>{console.log('reachable');s.destroy()});s.on('error',()=>console.log('blocked'));s.setTimeout(1200,()=>{console.log('blocked');s.destroy()})`)
    assert.equal(network, 'blocked')
    pass(`${cell.principal}: cross-domain list/search/prompt/follow/file/cookie and direct network access denied`)
    const upload = async sessionId => {
      const response = await fetch(`${cell.origin}/api/session/uploadFileBinary?sessionId=${sessionId}&name=probe.txt`, {
        method: 'POST', headers: { Cookie: cell.cookie, 'content-type': 'application/octet-stream' },
        body: `TEST_ONLY_${cell.principal.toUpperCase()}_UPLOAD`, signal: AbortSignal.timeout(10000),
      })
      assert.equal(response.status, 200)
      return response.json()
    }
    const receipt = await upload(cell.sessionId)
    assert.equal(receipt.ok, true, JSON.stringify(receipt))
    assert.ok(receipt.value.receiptId)
    assert.equal((await upload(other.sessionId)).ok, false)
    await writeFile(join(evidence, `${cell.principal}-upload.json`), JSON.stringify(receipt, null, 2))
    pass(`${cell.principal}: native raw file upload accepted locally and foreign Session upload rejected`)
  }
  for (const cell of cells) {
    await send(cell, cell.sessionId, 'PROBE_DELEGATE')
    await until(() => value(cell, 'subagents/list', { parentSessionId: cell.sessionId }), catalog => JSON.stringify(catalog).includes('identity probe child'))
    const catalog = await value(cell, 'subagents/list', { parentSessionId: cell.sessionId })
    await writeFile(join(evidence, `${cell.principal}-children.json`), JSON.stringify(catalog, null, 2))
    cell.childId = catalog.entries.find(entry => entry.kind === 'child' && entry.label === 'identity probe child').id
    cell.childAddress = { kind: 'subagent', parentSessionId: cell.sessionId, childSessionId: cell.childId, mode: 'continuable' }
    const childHistory = await waitText(cell, cell.childAddress, `TEST_ONLY_${cell.principal.toUpperCase()}_PRIVATE_MARKER`)
    assert.ok(!JSON.stringify(childHistory).includes(`TEST_ONLY_${cell.principal === 'alice' ? 'BOB' : 'ALICE'}_PRIVATE_MARKER`))
    await send(cell, cell.sessionId, 'PROBE_RESTRICT')
    const restricted = await until(() => value(cell, 'subagents/list', { parentSessionId: cell.sessionId }),
      catalog => catalog.entries.some(entry => entry.label === 'restricted probe child'))
    cell.restrictedId = restricted.entries.find(entry => entry.label === 'restricted probe child').id
    const restrictedAddress = { kind: 'subagent', parentSessionId: cell.sessionId, childSessionId: cell.restrictedId, mode: 'continuable' }
    const filteredHistory = await waitText(cell, restrictedAddress, 'FILTER_OK')
    assert.ok(!JSON.stringify(filteredHistory).includes('FILTER_BROKEN'))
    await value(cell, 'subagents/prompt', { request: { requestId: randomUUID(), parentSessionId: cell.sessionId,
      childSessionId: cell.restrictedId, mode: 'continuable', delivery: 'queue', content: [{ type: 'text', text: 'PROBE_FORCE_IDENTITY' }] } })
    await waitText(cell, restrictedAddress, 'unknown tool')
    const audit = await readFile(join(cell.directory, 'model-audit.jsonl'), 'utf8')
    assert.ok(!audit.includes('FILTER_BROKEN'))
    pass(`${cell.principal}: native continuable subagent and inherited toolFilter`)
  }
  browser = await chromium.launch({ headless: true,
    ...(process.env.DSH_PROBE_CHROMIUM ? { executablePath: process.env.DSH_PROBE_CHROMIUM } : {}), args: ['--no-sandbox'] })
  results.environment.chromium = browser.version()
  for (const cell of cells) {
    cell.browserContext = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 1000 } })
    cell.page = await cell.browserContext.newPage()
    cell.browserErrors = []
    cell.page.on('pageerror', error => cell.browserErrors.push(error.message))
    await cell.page.goto(`${cell.origin}/?token=${cell.token}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await cell.page.locator('[data-composer-input]').waitFor({ timeout: 45000 })
    await cell.page.getByRole('button', { name: 'Continue', exact: true }).click()
    await cell.page.getByRole('textbox', { name: 'Choose workspace' }).click()
    const dialog = cell.page.getByRole('dialog', { name: 'Select Workspace Directory' })
    await dialog.getByRole('button', { name: 'Edit path' }).click()
    const pathInput = dialog.getByRole('textbox', { name: 'Edit path' })
    await pathInput.fill('/domain/workspaces/project')
    await pathInput.press('Enter')
    await dialog.getByRole('button', { name: 'Open', exact: true }).click()
    const input = cell.page.locator('[data-composer-input][contenteditable="true"]')
    await input.waitFor()
    await input.click()
    await cell.page.keyboard.type(`PROBE_IDENTITY_BROWSER_${cell.principal.toUpperCase()}`)
    await cell.page.keyboard.press('Enter')
    await until(() => cell.page.locator('body').innerText(), body => body.includes(`PROBE_RESULT PROBE_IDENTITY_BROWSER_${cell.principal.toUpperCase()} TEST_ONLY_${cell.principal.toUpperCase()}_PRIVATE_MARKER`))
    await cell.page.screenshot({ path: join(evidence, `${cell.principal}-official-web.png`), fullPage: true })
    const body = await cell.page.locator('body').innerText()
    await writeFile(join(evidence, `${cell.principal}-official-web.txt`), body)
    assert.ok(body.length > 50)
    assert.equal(cell.browserErrors.length, 0, JSON.stringify(cell.browserErrors))
    assert.ok(!body.includes(`TEST_ONLY_${cell.principal === 'alice' ? 'BOB' : 'ALICE'}_PRIVATE_MARKER`))
    pass(`${cell.principal}: official Web workspace picker, composer, MCP call and streamed reply work without page errors`)
    results.metrics[cell.principal].dockerStats = JSON.parse(await docker('stats', '--no-stream', '--format', '{{json .}}', cell.name))
  }
  const beforeStop = performance.now()
  await docker('stop', '--time', '20', a.name)
  results.metrics.alice.stopMs = Math.round(performance.now() - beforeStop)
  results.metrics.alice.stopExitCode = Number(await docker('inspect', a.name, '--format', '{{.State.ExitCode}}'))
  assert.notEqual(results.metrics.alice.stopExitCode, 137)
  await send(b, b.sessionId, 'BOB_SURVIVES_ALICE_STOP')
  await waitText(b, b.address, 'PROBE_REPLY bob BOB_SURVIVES_ALICE_STOP')
  pass('stopping Alice leaves Bob fully operational')
  const restartAt = performance.now()
  await docker('start', a.name)
  await ready(a)
  results.metrics.alice.restartReadyMs = Math.round(performance.now() - restartAt)
  const afterRestart = await snapshot(a, a.address)
  assert.ok(JSON.stringify(afterRestart).includes('TEST_ONLY_ALICE_PRIVATE_MARKER'))
  await send(a, a.sessionId, 'ALICE_RESTARTED')
  await waitText(a, a.address, 'PROBE_REPLY alice ALICE_RESTARTED')
  pass('Alice restart recovers native history and resumes the same Session')
  await writeFile(join(a.directory, 'workspaces/project/identity.txt'), 'TEST_ONLY_ALICE_ROTATED_MARKER')
  await value(a, 'subagents/prompt', { request: { requestId: randomUUID(), parentSessionId: a.sessionId,
    childSessionId: a.childId, mode: 'continuable', delivery: 'queue', content: [{ type: 'text', text: 'PROBE_IDENTITY_AFTER_RESTART' }] } })
  await waitText(a, a.childAddress, 'TEST_ONLY_ALICE_ROTATED_MARKER')
  pass('native child cold continuation restores its Principal preset and MCP after process restart')
  await value(a, 'subagents/prompt', { request: { requestId: randomUUID(), parentSessionId: a.sessionId,
    childSessionId: a.restrictedId, mode: 'continuable', delivery: 'queue', content: [{ type: 'text', text: 'PROBE_CHECK_FILTER_AFTER_RESTART' }] } })
  await waitText(a, { kind: 'subagent', parentSessionId: a.sessionId, childSessionId: a.restrictedId, mode: 'continuable' },
    'FILTER_OK PROBE_CHECK_FILTER_AFTER_RESTART')
  pass('native toolFilter is restored during child cold continuation after process restart')
  for (const cell of cells) {
    const other = cell === a ? b : a
    assert.ok(JSON.stringify(cell.events.entries).includes(cell.sessionId), 'Event stream must contain own events to be a meaningful isolation check')
    assert.ok(!JSON.stringify(cell.events.entries).includes(other.sessionId))
    results.metrics[cell.principal].eventFramesObserved = cell.events.entries.length
  }
  pass('native server-push event streams contain no other Principal root Session identity')
  await docker('kill', '--signal', 'KILL', a.name)
  assert.equal(Number(await docker('inspect', a.name, '--format', '{{.State.ExitCode}}')), 137)
  await send(b, b.sessionId, 'BOB_SURVIVES_ALICE_CRASH')
  await waitText(b, b.address, 'PROBE_REPLY bob BOB_SURVIVES_ALICE_CRASH')
  await docker('start', a.name)
  await ready(a)
  await send(a, a.sessionId, 'ALICE_CRASH_RECOVERED')
  await waitText(a, a.address, 'PROBE_REPLY alice ALICE_CRASH_RECOVERED')
  pass('idle SIGKILL of Alice leaves Bob operational and Alice can resume its persisted Session')
  results.status = 'passed'
} catch (error) {
  results.status = 'failed'
  results.error = String(error.stack ?? error).replace(/token=[^\s&]+/g, 'token=REDACTED')
  console.error(results.error)
  for (const cell of cells) {
    if (cell.page && !cell.page.isClosed()) {
      await cell.page.screenshot({ path: join(evidence, `${cell.principal}-failure.png`) }).catch(() => {})
      await writeFile(join(evidence, `${cell.principal}-failure.txt`), JSON.stringify({
        body: await cell.page.locator('body').innerText().catch(() => ''), errors: cell.browserErrors,
      }, null, 2)).catch(() => {})
    }
  }
  process.exitCode = 1
} finally {
  results.cleanupErrors = []
  const cleanup = async action => { try { await action() } catch (error) { results.cleanupErrors.push(String(error)) } }
  await cleanup(() => browser?.close())
  for (const cell of cells) {
    for (const handle of cell.streams) handle.close()
    for (const socket of cell.sockets) socket.destroy()
    await cleanup(() => new Promise(resolve => cell.proxy ? cell.proxy.close(resolve) : resolve()))
    if (cell.containerCreated) await cleanup(() => docker('rm', '-f', cell.name))
    if (cell.networkCreated) await cleanup(() => docker('network', 'rm', cell.network))
  }
  await cleanup(async () => {
    assert.equal(await docker('ps', '-aq', '--filter', `label=dsh-native-probe=${prefix}`), '')
    assert.equal(await docker('network', 'ls', '-q', '--filter', `label=dsh-native-probe=${prefix}`), '')
    await rm(work, { recursive: true, force: true })
  })
  if (results.cleanupErrors.length) { results.status = 'failed'; process.exitCode = 1 }
  else pass('all probe containers, networks and private temporary data released')
  results.finishedAt = new Date().toISOString()
  await writeFile(join(evidence, 'results.json'), JSON.stringify(results, null, 2) + '\n')
}
