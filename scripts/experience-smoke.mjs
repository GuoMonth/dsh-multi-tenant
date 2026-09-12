import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { once } from 'node:events'
import { chromium } from './native-host-probe/node_modules/playwright/index.mjs'
import { installArtifact } from './installed-package.mjs'
const image = process.env.DSH_EXPERIENCE_IMAGE
assert.match(image ?? '', /^(sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})$/)
const installed = installArtifact()
const root = await mkdtemp(join(tmpdir(), 'dsh-cli-'))
const directory = join(root, 'state')
const cli = join(installed.packageDirectory, 'dist/cli.mjs')
assert.match(execFileSync('npm', ['exec', '--offline', '--', 'dsh-multi-tenant', '--help'], { cwd: installed.directory, encoding: 'utf8' }), /start\|status\|stop\|doctor/)
let child, browser, failure
const report = { checks: [], measurements: {}, passed: false }
const run = (...args) => execFileSync(process.execPath, [cli, ...args, '--data-dir', directory], { encoding: 'utf8' })
async function launch() {
  const started = performance.now()
  child = spawn(process.execPath, [cli, 'start', '--no-open', '--port', '0', '--image', image, '--data-dir', directory], { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; let ready = false
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CLI readiness timeout')), 120_000)
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/dsh\.[a-f0-9-]+\.localhost:\d+\/#[A-Za-z0-9_-]+/); if (match && !ready) { ready = true; clearTimeout(timeout); report.measurements.launchMs = performance.now() - started; resolve(match[0]) } })
    child.stderr.on('data', () => {})
    child.once('exit', code => { clearTimeout(timeout); if (!output.includes('Ready /')) reject(new Error(`CLI exited before readiness: ${code}`)) })
  })
}
async function stop() {
  if (!child || child.exitCode !== null) return
  const exited = once(child, 'exit')
  run('stop')
  await Promise.race([exited, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('CLI stop timeout')), 45_000); timer.unref() })])
}
async function openUser(page, url, principal) {
  await page.goto(url)
  await page.waitForURL(value => !value.hash)
  const buttons = page.getByRole('button', { name: '进入工作台 →' })
  await buttons.nth(principal === 'alice' ? 0 : 1).click()
  await page.waitForURL(value => value.hostname.startsWith(principal + '.') && !value.pathname.startsWith('/_experience'), { timeout: 120_000 })
  const notice = page.getByRole('button', { name: 'Continue', exact: true })
  await notice.waitFor({ timeout: 8000 }).then(() => notice.click()).catch(() => {})
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor()
}
async function send(page, text, expected) {
  await page.locator('[contenteditable="true"]').fill(text)
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.waitForFunction(value => document.body.innerText.includes(value), expected, { timeout: 60_000 })
}
try {
  const url = await launch()
  browser = await chromium.launch({ headless: true, ...(process.env.PROBE_CHROMIUM ? { executablePath: process.env.PROBE_CHROMIUM } : {}) })
  const aContext = await browser.newContext(), bContext = await browser.newContext()
  const a = await aContext.newPage(), b = await bContext.newPage()
  await openUser(a, url, 'alice')
  await a.screenshot({ path: join(root, 'alice.png') })
  await send(a, 'Read my sample', "This private sample belongs to alice.")
  await send(a, 'Create a file', 'Created /domain/workspace/demo-output.md')
  await send(a, 'Delegate to a subagent', 'demo_delegate')
  await a.waitForFunction(async () => {
    const rpc = async (method, args) => fetch('/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:method,method,payload:{args}})}).then(r=>r.json())
    const list = await rpc('session/list', {_request:{}})
    for (const root of list.result?.value?.items ?? []) {
      const children = await rpc('subagents/list', {parentSessionId:root.sessionId})
      if (children.result?.value?.entries?.some(entry=>entry.kind==='child')) return true
    }
    return false
  }, undefined, {timeout:60000})
  await openUser(b, run('start','--no-open').match(/http:\/\/dsh\.[a-f0-9-]+\.localhost:\d+\/#[A-Za-z0-9_-]+/)[0], 'bob')
  await send(b, 'Read my sample', 'This private sample belongs to bob.')
  assert.ok(!(await b.locator('body').innerText()).includes('belongs to alice'))
  await b.screenshot({ path: join(root, 'bob.png') })
  report.checks.push('Installed CLI opens real native Web; two Principals run private MCP samples, file generation and native delegation')
  const config = JSON.parse(await readFile(join(directory, 'instance.json')))
  const names = execFileSync('docker', ['ps','--filter',`label=dsh.instance=${config.instance}`,'--format','{{.Names}}'],{encoding:'utf8'}).trim().split('\n')
  assert.equal(names.length, 2)
  for (const name of names) {
    const info = JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0]
    const port = info.NetworkSettings.Ports['3082/tcp'][0].HostPort
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,401)
    assert.equal((await fetch(`http://127.0.0.1:${port}/?token=fake`)).status,401)
    assert.ok(!info.Mounts.some(m => m.Type === 'bind'))
  }
  report.checks.push('Raw published relay denies unauthenticated/native token-exchange access; worker has no host bind mounts')
  await stop()
  await rm(join(directory,'seeded.json')) // simulate interruption after native seeding but before local publication
  const next = await launch()
  await openUser(a, next, 'alice')
  await send(a, 'Read my sample', 'This private sample belongs to alice.')
  const output = execFileSync('docker',['ps','--filter',`label=dsh.instance=${config.instance}`,'--format','{{.Names}}'],{encoding:'utf8'}).trim()
  assert.match(execFileSync('docker',['exec',output,'cat','/domain/workspace/demo-output.md'],{encoding:'utf8'}), /Created for alice/)
  report.checks.push('Stop/start keeps native history and generated files in the same domain')
  report.passed = true
} catch (error) { failure = error; report.error = String(error) }
finally {
  if (browser) await browser.close()
  try { await stop() } catch (error) { failure ??= error; report.passed = false; report.cleanupError = String(error) }
  // Only this exact test instance is eligible for volume cleanup.
  if (!failure) {
    const config = JSON.parse(await readFile(join(directory, 'instance.json')))
    const volumes = execFileSync('docker',['volume','ls','--filter',`label=dsh.instance=${config.instance}`,'--format','{{.Name}}'],{encoding:'utf8'}).trim().split('\n').filter(Boolean)
    for (const volume of volumes) execFileSync('docker',['volume','rm',volume],{stdio:'pipe'})
    await rm(directory,{recursive:true,force:true})
  }
  await writeFile(join(root,'report.json'),JSON.stringify(report,null,2))
  installed.close()
  console.log(`CLI evidence: ${root}\n${JSON.stringify(report,null,2)}`)
}
if (failure) throw failure
