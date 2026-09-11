/** Real rc.2 hosts; only model and MCP test data are fixtures. No production auth proxy. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import WebSocket from 'ws'
import { createServer, connect } from 'node:net'

const exec = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const label = `dsh-wp1-${process.pid}-${Date.now()}`
const image = `${label}:rc2`
const directory = await mkdtemp(join(tmpdir(), 'dsh-wp1-'))
const report = { dsh: '0.1.5-rc.2', checks: [], limitations: ['Test CLI login, not a production authentication gateway.', 'No claim of completed WP2-WP4.'] }
const domains = []
const pages = []
let browser
let networkCreated = false
let imageCreated = false
const docker = async (...args) => (await exec('docker', args, { maxBuffer: 8 * 1024 * 1024 })).stdout.trim()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(description, operation, timeout = 45000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const value = await operation()
    if (value) return value
    await sleep(150)
  }
  throw new Error(`Timeout: ${description}`)
}
function passed(description) { report.checks.push(description); console.log(`PASS: ${description}`) }

async function start(principal) {
  const name = `${label}-${principal}`
  const data = join(directory, principal)
  await mkdir(join(data, 'workspaces/project'), { recursive: true })
  await mkdir(join(data, 'presets/probe'), { recursive: true })
  await writeFile(join(data, 'presets/probe/agent.cordis.yml'), await readFile(join(here, 'agent.cordis.yml')))
  await mkdir(join(data, 'presets/probe-alt'), { recursive: true })
  await writeFile(join(data, 'presets/probe-alt/agent.cordis.yml'), await readFile(join(here, 'agent.cordis.yml')))
  await writeFile(join(data, 'workspaces/project/identity.txt'), `PRIVATE_${principal}`)
  await chmod(directory, 0o755)
  // A named volume is owned by the container user; the host fixture directory is copied once.
  const volume = `${name}-data`
  await docker('volume', 'create', volume)
  const domain = { name, volume, principal }
  domains.push(domain)
  await docker('run', '--rm', '--network', 'none', '--user', '0:0', '-v', `${volume}:/domain`,
    '-v', `${data}:/seed:ro`, '--entrypoint', 'sh', image, '-c', 'cp -R /seed/. /domain/ && chown -R 1000:1000 /domain')
  await docker('run', '-d', '--name', name, '--network', label, '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--memory=1g', '--pids-limit=160',
    '-v', `${volume}:/domain`, '-e', `PROBE_PRINCIPAL=${principal}`, image)
  const address = JSON.parse(await docker('inspect', name))[0].NetworkSettings.Networks[label].IPAddress
  domain.sockets = new Set()
  domain.relay = createServer(socket => {
    domain.sockets.add(socket)
    const upstream = connect(3080, address)
    socket.pipe(upstream).pipe(socket)
    socket.on('error', () => upstream.destroy())
    upstream.on('error', () => socket.destroy())
    socket.on('close', () => { upstream.destroy(); domain.sockets.delete(socket) })
  })
  await new Promise(resolve => domain.relay.listen(0, '127.0.0.1', resolve))
  const port = domain.relay.address().port
  domain.origin = `http://127.0.0.1:${port}`
  await login(domain)
  return domain
}

async function login(domain) {
  // Official CLI startup URL is a test fixture credential; never persist or print it.
  const token = await until('official CLI authentication URL', async () => {
    const output = await exec('docker', ['logs', domain.name])
    const logs = output.stdout + output.stderr
    const state = JSON.parse(await docker('inspect', domain.name))[0].State
    if (!state.Running) throw new Error(`Host exited: ${logs.replace(/token=[^\s&]+/g, 'token=REDACTED')}`)
    return [...logs.matchAll(/[?&]token=([A-Za-z0-9_.~-]+)/g)].at(-1)?.[1]
  })
  const login = await fetch(`${domain.origin}/?token=${token}`, { redirect: 'manual' })
  assert.equal(login.status, 303)
  domain.cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  assert.ok(domain.cookie)
}

async function rpc(domain, endpoint, args, acceptFailure = false) {
  const res = await fetch(`${domain.origin}/api/${endpoint}`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: domain.cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint, payload: { args } }),
    signal: AbortSignal.timeout(30000),
  })
  assert.equal(res.status, 200, `${endpoint}: HTTP ${res.status}`)
  const { result } = await res.json()
  if (acceptFailure) return result
  assert.equal(result.ok, true, `${endpoint}: ${JSON.stringify(result.error)}`)
  return result.value
}

async function snapshot(domain, address) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${domain.origin.replace('http:', 'ws:')}/api/remote.mux`, { headers: { cookie: domain.cookie } })
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('follow snapshot timeout')) }, 15000)
    let settled = false
    const fail = error => { settled = true; clearTimeout(timer); socket.terminate(); reject(error) }
    socket.on('error', fail)
    socket.on('open', () => socket.send(JSON.stringify({ type: 'open', streamId: 'probe', endpoint: 'session/follow', payload: { args: { request: { address } } } })))
    socket.on('message', bytes => {
      const frame = JSON.parse(bytes.toString())
      settled = true
      clearTimeout(timer)
      socket.close()
      if (frame.type === 'error') reject(new Error(`follow: ${JSON.stringify(frame)}`))
      else resolve(frame)
    })
    socket.on('close', () => {
      clearTimeout(timer)
      if (!settled) reject(new Error('follow closed before first frame'))
    })
  })
}

async function prompt(domain, sessionId, text) {
  return rpc(domain, 'session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text }] } })
}
async function childPrompt(domain, parentSessionId, childSessionId, text) {
  return rpc(domain, 'subagents/prompt', { request: { parentSessionId, childSessionId, requestId: randomUUID(),
    mode: 'continuable', delivery: 'queue', content: [{ type: 'text', text }] } })
}
async function waitText(domain, address, text) {
  return until(text, async () => {
    const state = await snapshot(domain, address)
    return JSON.stringify(state).includes(text) && state
  })
}

try {
  console.log('Building the isolated rc.2 fixture image')
  await docker('build', '-q', '-t', image, here)
  imageCreated = true
  await docker('network', 'create', '--internal', label)
  networkCreated = true
  const alice = await start('alice')
  const bob = await start('bob')
  report.node = await docker('exec', alice.name, 'node', '--version')
  passed('two real dsh web profiles start with isolated homes and native authentication')
  for (const d of domains) {
    assert.equal((await fetch(`${d.origin}/api/session/list`, { method: 'POST' })).status, 401)
    const workspace = await rpc(d, 'workspace/create', { request: { path: '/domain/workspaces/project' } })
    assert.ok(workspace.workspace.workspaceId)
    const session = await rpc(d, 'session/create', { request: { workspaceId: workspace.workspace.workspaceId, sessionId: '00000000-0000-4000-8000-000000000001', agentPreset: 'probe' } })
    assert.equal(session.sessionId, '00000000-0000-4000-8000-000000000001')
    await rpc(d, 'session/rename', { request: { sessionId: session.sessionId, title: `${d.principal.toUpperCase()}_ROOT` } })
    await prompt(d, session.sessionId, 'PROBE_IDENTITY')
    const state = await waitText(d, { kind: 'session', sessionId: session.sessionId }, `PRIVATE_${d.principal}`)
    assert.ok(!JSON.stringify(state).includes(`PRIVATE_${d.principal === 'alice' ? 'bob' : 'alice'}`))
  }
  passed('same Session identity, preset and MCP name resolve only each domain private marker')
  await prompt(alice, '00000000-0000-4000-8000-000000000001', 'PROBE_DELEGATE')
  const catalog = await until('native child catalog', async () => {
    const value = await rpc(alice, 'subagents/list', { parentSessionId: '00000000-0000-4000-8000-000000000001' })
    return value.entries.length && value
  })
  const child = catalog.entries.find(entry => entry.kind === 'child')
  const childAddress = { kind: 'subagent', mode: 'continuable', parentSessionId: '00000000-0000-4000-8000-000000000001', childSessionId: child.id }
  await waitText(alice, childAddress, 'PRIVATE_alice')
  await childPrompt(alice, '00000000-0000-4000-8000-000000000001', child.id, 'PROBE_DELEGATE')
  const grandchildren = await until('grandchild', async () => {
    const value = await rpc(alice, 'subagents/list', { parentSessionId: child.id })
    return value.entries.length && value.entries
  })
  await waitText(alice, { kind: 'subagent', mode: 'continuable', parentSessionId: child.id, childSessionId: grandchildren[0].id }, 'PRIVATE_alice')
  passed('native continuable child and grandchild inherit the domain preset MCP')
  await prompt(alice, '00000000-0000-4000-8000-000000000001', 'PROBE_RESTRICT')
  const restricted = await until('restricted child', async () => {
    const value = await rpc(alice, 'subagents/list', { parentSessionId: '00000000-0000-4000-8000-000000000001' })
    return value.entries.find(entry => entry.label === 'restricted probe child')
  })
  const restrictedAddress = { kind: 'subagent', mode: 'continuable', parentSessionId: '00000000-0000-4000-8000-000000000001', childSessionId: restricted.id }
  await waitText(alice, restrictedAddress, 'FILTER_OK')
  await childPrompt(alice, '00000000-0000-4000-8000-000000000001', restricted.id, 'PROBE_FORCE_IDENTITY')
  const denied = await waitText(alice, restrictedAddress, 'unknown tool')
  assert.ok(!JSON.stringify(denied).includes('PRIVATE_alice'))
  passed('native child toolFilter removes MCP schemas and rejects forced tool execution')
  await prompt(alice, '00000000-0000-4000-8000-000000000001', 'PROBE_FORK')
  const fork = await until('one-shot fork', async () => {
    const value = await rpc(alice, 'subagents/list', { parentSessionId: '00000000-0000-4000-8000-000000000001' })
    return value.entries.find(entry => entry.mode === 'one-shot')
  })
  await waitText(alice, { kind: 'subagent', mode: 'one-shot', parentSessionId: '00000000-0000-4000-8000-000000000001', childSessionId: fork.id }, 'PRIVATE_alice')
  passed('native one-shot fork resolves the domain preset MCP')
  await rpc(alice, 'session/create', { request: { cwd: '/domain/workspaces/project', sessionId: '00000000-0000-4000-8000-000000000002', agentPreset: 'probe' } })
  await rpc(alice, 'agentPresets/select', { agentId: '00000000-0000-4000-8000-000000000002', agentPreset: 'probe-alt' })
  await prompt(alice, '00000000-0000-4000-8000-000000000002', 'PROBE_IDENTITY')
  await waitText(alice, { kind: 'session', sessionId: '00000000-0000-4000-8000-000000000002' }, 'PRIVATE_alice')
  passed('native blank-session preset switching retains the domain MCP')

  // Same public path, different real bytes; raw file routes still use native authentication.
  for (const d of domains) {
    const file = await fetch(`${d.origin}/api/file?path=/domain/workspaces/project/identity.txt`, { headers: { cookie: d.cookie } })
    assert.equal(file.status, 200)
    assert.equal(await file.text(), `PRIVATE_${d.principal}`)
  }
  const crossCookie = await fetch(`${bob.origin}/api/file?path=/domain/workspaces/project/identity.txt`, { headers: { cookie: alice.cookie } })
  assert.equal(crossCookie.status, 401)
  passed('native file route reads domain bytes and refuses another host browser cookie')

  const upload = await fetch(`${alice.origin}/api/session/uploadFileBinary?sessionId=00000000-0000-4000-8000-000000000001&name=probe.txt`, {
    method: 'POST', headers: { cookie: alice.cookie, 'content-type': 'application/octet-stream' }, body: 'ALICE_UPLOAD',
  })
  assert.equal(upload.status, 200)
  const uploadResult = await upload.json()
  assert.equal(uploadResult.ok, true, JSON.stringify(uploadResult))
  passed('native raw upload route accepts a domain Session upload')

  await docker('stop', '-t', '15', alice.name)
  assert.equal(JSON.parse(await docker('inspect', alice.name))[0].State.Running, false)
  await docker('start', alice.name)
  await until('restart authentication', async () => { try { await login(alice); return true } catch { return false } })
  await waitText(alice, childAddress, 'PRIVATE_alice')
  await prompt(alice, '00000000-0000-4000-8000-000000000001', 'PROBE_AFTER_RESTART')
  await waitText(alice, { kind: 'session', sessionId: '00000000-0000-4000-8000-000000000001' }, 'PROBE_REPLY alice PROBE_AFTER_RESTART')
  await childPrompt(alice, '00000000-0000-4000-8000-000000000001', child.id, 'PROBE_COLD_CONTINUATION')
  await waitText(alice, childAddress, 'PROBE_REPLY alice PROBE_COLD_CONTINUATION')
  await childPrompt(alice, '00000000-0000-4000-8000-000000000001', restricted.id, 'PROBE_FORCE_IDENTITY_AFTER_RESTART')
  await waitText(alice, restrictedAddress, 'PROBE_RESULT PROBE_FORCE_IDENTITY_AFTER_RESTART')
  const restoredDenial = await snapshot(alice, restrictedAddress)
  assert.ok(JSON.stringify(restoredDenial).includes('unknown tool'))
  assert.ok(!JSON.stringify(restoredDenial).includes('PRIVATE_alice'))
  passed('real host restart preserves cold history and native continuations')

  browser = await chromium.launch({ ...(process.env.PROBE_CHROMIUM ? { executablePath: process.env.PROBE_CHROMIUM } : {}), headless: true, args: ['--no-sandbox'] })
  report.browser = browser.version()
  for (const d of domains) {
    const listing = await rpc(d, 'session/list', { _request: {} })
    await writeFile(join(directory, `${d.principal}-sessions.json`), JSON.stringify(listing, null, 2))
    assert.ok(!JSON.stringify(listing).includes(`PRIVATE_${d.principal === 'alice' ? 'bob' : 'alice'}`))
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    for (const pair of d.cookie.split('; ')) {
      const equals = pair.indexOf('=')
      await context.addCookies([{ name: pair.slice(0, equals), value: pair.slice(equals + 1), url: d.origin }])
    }
    const page = await context.newPage()
    pages.push({ principal: d.principal, page })
    const errors = []
    let sockets = 0
    page.on('websocket', () => { sockets++ })
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(d.origin)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByText(`${d.principal.toUpperCase()}_ROOT`, { exact: true }).click()
    const composer = page.locator('[data-composer-input][contenteditable="true"]')
    await composer.fill('PROBE_BROWSER_SEND')
    await composer.press('Enter')
    await page.getByText(`PROBE_REPLY ${d.principal} PROBE_BROWSER_SEND`, { exact: true }).waitFor()
    const beforeReconnect = sockets
    await context.setOffline(true)
    await page.waitForTimeout(500)
    await context.setOffline(false)
    await until('native browser mux reconnect', async () => sockets > beforeReconnect)
    await composer.fill('PROBE_BROWSER_RECONNECT')
    await composer.press('Enter')
    await page.getByText(`PROBE_REPLY ${d.principal} PROBE_BROWSER_RECONNECT`, { exact: true }).waitFor()
    const visible = await page.locator('body').innerText()
    await writeFile(join(directory, `${d.principal}-web.txt`), visible)
    await page.screenshot({ path: join(directory, `${d.principal}-web.png`), fullPage: true })
    assert.ok(visible.length > 50, 'native Web must render meaningful content')
    assert.deepEqual(errors, [])
    assert.ok(!visible.includes(`${d.principal === 'alice' ? 'BOB' : 'ALICE'}_ROOT`))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    await context.close()
  }
  passed('official Web sends messages, reconnects its mux, opens settings and keeps domain lists separate')
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2))
} catch (error) {
  report.failure = `${error.stack ?? error}\n${error.cause?.stack ?? ''}`.replace(/token=[^\s&]+/g, 'token=REDACTED')
  console.error(report.failure)
  for (const { principal, page } of pages) {
    if (!page.isClosed()) {
      await page.screenshot({ path: join(directory, `${principal}-failure.png`), fullPage: true }).catch(() => {})
      await writeFile(join(directory, `${principal}-failure.txt`), await page.locator('body').innerText()).catch(() => {})
    }
  }
  for (const d of domains) {
    try {
      const state = JSON.parse(await docker('inspect', d.name))[0].State
      const logs = await exec('docker', ['logs', '--tail', '35', d.name])
      const diagnostic = (logs.stdout + logs.stderr).replace(/token=[^\s&]+/g, 'token=REDACTED')
      await writeFile(join(directory, `${d.principal}-failure.log`), JSON.stringify(state) + '\n' + diagnostic)
      console.error(`${d.principal}: ${JSON.stringify(state)}\n${diagnostic}`)
    } catch (diagnosticError) { console.error(`Unable to collect ${d.principal} diagnostics: ${diagnosticError.message}`) }
  }
  process.exitCode = 1
} finally {
  const cleanupErrors = []
  const clean = async operation => { try { await operation() } catch (error) { cleanupErrors.push(String(error)) } }
  await clean(() => browser?.close())
  for (const d of domains) {
    for (const socket of d.sockets ?? []) socket.destroy()
    d.relay?.close()
    await clean(() => docker('rm', '-f', d.name))
    await clean(() => docker('volume', 'rm', d.volume))
  }
  if (networkCreated) await clean(() => docker('network', 'rm', label))
  if (imageCreated) await clean(() => docker('image', 'rm', image))
  report.cleanup = { errors: cleanupErrors }
  report.passed = !report.failure && cleanupErrors.length === 0
  if (!report.passed) process.exitCode = 1
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`Evidence: ${directory}/report.json`)
}
