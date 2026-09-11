// WP2: run the new coordinator/provider against the real, frozen native Web CLI.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { SQLiteDomainRepository } from '../../packages/multi-tenant/src/domain/sqlite.ts'
import { DomainRuntimeCoordinator } from '../../packages/multi-tenant/src/runtime/coordinator.ts'
import { LocalProcessRuntimeProvider } from '../../packages/multi-tenant/src/runtime/providers/local-process.ts'

const require = createRequire(import.meta.url)
const manifestPath = require.resolve('@deepseek-ai/dsh/package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
assert.equal(manifest.version, '0.1.5-rc.2')
const cli = join(dirname(manifestPath), 'lib/bin.js')
const control = fileURLToPath(new URL('../../packages/multi-tenant/src/native/runtime-control.mjs', import.meta.url))
const directory = await mkdtemp(join(tmpdir(), 'dsh-wp2-native-'))
const data = join(directory, 'data')
const report = { dsh: manifest.version, node: process.version, checks: [], passed: false }
let coordinator
let repository
let failure
try {
  repository = new SQLiteDomainRepository(join(data, 'directory'))
  const commands = new Map()
  let launches = 0
  const provider = new LocalProcessRuntimeProvider(spec => {
    launches++
    return commands.get(spec.domainId)
  }, 2_000)
  coordinator = new DomainRuntimeCoordinator(repository, provider, manifest.version, 30_000, 8_000)
  for (const principalId of ['alice', 'bob']) {
    const record = repository.resolve({ tenantId: 'probe', principalId })
    const home = join(data, record.id)
    await mkdir(join(home, 'tmp'), { recursive: true })
    const patch = join(home, 'runtime.patch.json')
    await writeFile(patch, JSON.stringify([
      { id: 'web-runtime', config: { printUrl: false, openBrowser: false } },
      ...['llm-deepseek', 'llm-pi-ai', 'session-title-llm', 'session-telemetry-otel'].map(id => ({ id, disabled: true })),
      { id: 'session-query-sqlite', config: { path: join(home, 'query.sqlite'), openAt: 'first-search' } },
      { insert: [{ id: 'domain-runtime-control', name: control, config: { runtimeManifest: manifestPath } }] },
    ]))
    commands.set(record.id, {
      executable: process.execPath,
      args: [cli, '--profile', 'web', '--patch', patch, '--host', '127.0.0.1', '--port', '0', '--no-open'],
      cwd: home,
      env: { HOME: home, DSH_HOME: join(home, 'dsh-home'), TMPDIR: join(home, 'tmp'), PATH: `${dirname(process.execPath)}:/usr/bin:/bin` },
    })
  }
  const alice = { tenantId: 'probe', principalId: 'alice' }
  const bob = { tenantId: 'probe', principalId: 'bob' }
  const [a, duplicate, b] = await Promise.all([coordinator.ensure(alice), coordinator.ensure(alice), coordinator.ensure(bob)])
  assert.equal(a, duplicate)
  assert.equal(launches, 2)
  assert.notEqual(a.endpoint, b.endpoint)
  report.checks.push('Two real native Web profiles reach appReady; concurrent enters deduplicate startup')
  for (const admission of [a, b]) {
    const response = await fetch(`${admission.endpoint}/api/session/list`, { method: 'POST' })
    assert.equal(response.status, 401)
    await response.arrayBuffer()
  }
  report.checks.push('Native connection routes are active and retain browser authentication')
  await coordinator.stop(a.domainId)
  assert.equal(a.signal.aborted, true)
  assert.equal(b.signal.aborted, false)
  await assert.rejects(fetch(a.endpoint))
  const command = commands.get(a.domainId)
  const patch = command.args[4]
  const original = await readFile(patch, 'utf8')
  const brokenPlugin = join(command.cwd, 'broken-plugin.mjs')
  await writeFile(brokenPlugin, 'export function apply() { throw new Error("Injected native boot failure") }\n')
  await writeFile(patch, JSON.stringify([
    ...JSON.parse(original), { insert: [{ id: 'injected-boot-failure', name: brokenPlugin }] },
  ]))
  await assert.rejects(coordinator.ensure(alice), /exited before readiness/)
  assert.equal(repository.get(a.domainId).unresolved, false)
  assert.equal(b.signal.aborted, false)
  await writeFile(patch, original)
  report.checks.push('A failing native sibling plugin never passes readiness and releases its process ownership')
  const next = await coordinator.ensure(alice)
  assert.equal(next.generation, a.generation + 2)
  report.checks.push('Stopping one native host closes its listener and preserves the other; restart advances generation')
  await coordinator.setDesired(next.domainId, 'revoked')
  assert.equal(next.signal.aborted, true)
  await assert.rejects(coordinator.ensure(alice), /not enabled/)
  report.checks.push('Durable domain revocation rejects new runtime admission and invalidates the old lease')
  await coordinator.close()
  const reopened = new SQLiteDomainRepository(join(data, 'directory'))
  try {
    assert.equal(reopened.resolve(alice).desired, 'revoked')
    assert.equal(reopened.resolve(alice).unresolved, false)
    assert.equal(reopened.resolve(bob).unresolved, false)
  } finally { reopened.close() }
  report.checks.push('Clean shutdown releases all native owners and coordinator lock; policy survives reopening')
} catch (error) {
  failure = error
} finally {
  try {
    if (coordinator) await coordinator.close()
    else repository?.close()
  }
  catch (error) { failure = new AggregateError([...(failure ? [failure] : []), error], 'Native probe cleanup failed') }
  // On failed cleanup keep the directory and unresolved journal for inspection.
  if (!failure) {
    try { await rm(data, { recursive: true, force: true }) }
    catch (error) { failure = error }
  }
  report.passed = !failure
  if (failure) report.error = String(failure)
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`WP2 native runtime evidence: ${directory}`)
}
if (failure) throw failure
console.log(JSON.stringify(report, null, 2))
