import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const baselinePath = `${relative(root, import.meta.dirname)}/lint-baseline.json`
const key = entry => JSON.stringify([entry.file, entry.code, entry.hash])

/** Fingerprint the owning statement, excluding comments, spacing and quote choice. */
export function fingerprint(diagnostic, source) {
  assert.match(diagnostic.code, /^typescript\([a-z-]+\)$/u, 'Only existing TypeScript debt can be baselined')
  const span = diagnostic.labels[0].span
  const offset = Buffer.from(source).subarray(0, span.offset).toString('utf8').length
  const file = ts.createSourceFile(diagnostic.filename, source, ts.ScriptTarget.Latest, true)
  let owner = file
  const visit = (node) => {
    if (offset < node.getFullStart() || offset >= node.end) return
    if (ts.isStatement(node) || ts.isPropertySignature(node) || ts.isParameter(node)) owner = node
    ts.forEachChild(node, visit)
  }
  visit(file)
  const owners = []
  for (let node = owner.parent; node && node !== file; node = node.parent) {
    if (node.name && ts.isIdentifier(node.name)) owners.push(node.name.text)
  }
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, owner.getText(file))
  const tokens = []
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    tokens.push([kind, scanner.getTokenValue() ?? scanner.getTokenText()])
  }
  return {
    file: diagnostic.filename,
    code: diagnostic.code,
    hash: createHash('sha256').update(JSON.stringify([owners, tokens])).digest('hex'),
  }
}

export function validateBaseline(baseline) {
  assert.equal(baseline.version, 1, 'Unsupported lint baseline')
  assert.ok(Array.isArray(baseline.entries))
  const seen = new Set()
  for (const entry of baseline.entries) {
    assert.match(entry.file, /^(?:packages|integration)\/(?!.*\.\.\/).+\.ts$/u)
    assert.match(entry.code, /^typescript\([a-z-]+\)$/u)
    assert.match(entry.hash, /^[a-f0-9]{64}$/u)
    assert.ok(Number.isSafeInteger(entry.count) && entry.count > 0)
    assert.ok(!seen.has(key(entry)), 'Duplicate lint allowance')
    seen.add(key(entry))
  }
  return baseline
}

/** A committed allowance may only be removed or reduced. */
export function assertNoGrowth(current, previous) {
  const limits = new Map(validateBaseline(previous).entries.map(entry => [key(entry), entry.count]))
  for (const entry of validateBaseline(current).entries) {
    assert.ok(entry.count <= (limits.get(key(entry)) ?? 0), `Lint baseline cannot grow: ${entry.file} ${entry.code}`)
  }
}

export function compareDiagnostics(diagnostics, baseline, readSource) {
  const expected = new Map(validateBaseline(baseline).entries.map(entry => [key(entry), entry.count]))
  const observed = new Map()
  const unexpected = []
  for (const diagnostic of diagnostics) {
    if (!/^typescript\([a-z-]+\)$/u.test(diagnostic.code ?? '')) {
      unexpected.push(diagnostic)
      continue
    }
    const entry = fingerprint(diagnostic, readSource(diagnostic.filename))
    const id = key(entry)
    const count = (observed.get(id)?.count ?? 0) + 1
    observed.set(id, { ...entry, count })
    if (count > (expected.get(id) ?? 0)) unexpected.push(diagnostic)
  }
  const stale = baseline.entries.filter(entry => (observed.get(key(entry))?.count ?? 0) !== entry.count)
  return { unexpected, stale, entries: [...observed.values()].sort((a, b) => key(a).localeCompare(key(b))) }
}

function trustedBaseline() {
  const ref = process.env.LINT_BASE_REF ?? 'refs/remotes/origin/main'
  assert.match(ref, /^(?:[a-f0-9]{40}|refs\/remotes\/origin\/main)$/u, 'Use the trusted PR base commit')
  const commit = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: root, encoding: 'utf8' })
  assert.equal(commit.status, 0, 'Fetch the trusted base before linting')
  const listing = spawnSync('git', ['ls-tree', '--name-only', ref, '--', baselinePath], { cwd: root, encoding: 'utf8' })
  assert.equal(listing.status, 0, 'Could not inspect the trusted lint baseline')
  // The initial engineering PR introduces this file; later PRs cannot expand it.
  if (!listing.stdout.trim()) return undefined
  const content = spawnSync('git', ['show', `${ref}:${baselinePath}`], { cwd: root, encoding: 'utf8' })
  assert.equal(content.status, 0, 'Could not read the trusted lint baseline')
  return JSON.parse(content.stdout)
}

function main() {
  const args = process.argv.slice(2)
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--prune'), 'Usage: lint.mjs [--prune]')
  const baseline = validateBaseline(JSON.parse(readFileSync(resolve(root, baselinePath), 'utf8')))
  const trusted = trustedBaseline()
  if (trusted) assertNoGrowth(baseline, trusted)
  const run = spawnSync(process.execPath, [resolve(root, 'node_modules/oxlint/bin/oxlint'), '--format', 'json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (run.error) throw run.error
  assert.ok(run.status === 0 || run.status === 1, run.stderr || `Oxlint terminated: ${run.signal ?? run.status}`)
  const report = JSON.parse(run.stdout)
  assert.ok(Array.isArray(report.diagnostics), 'Oxlint did not return diagnostics')
  assert.ok(run.status === 0 || report.diagnostics.length > 0, 'Oxlint failed without diagnostics')
  const result = compareDiagnostics(report.diagnostics, baseline, filename => readFileSync(resolve(root, filename), 'utf8'))
  for (const diagnostic of result.unexpected.slice(0, 30)) {
    const span = diagnostic.labels?.[0]?.span
    console.error(`${diagnostic.filename}:${span?.line ?? 0}:${span?.column ?? 0} ${diagnostic.code}: ${diagnostic.message}`)
  }
  if (result.unexpected.length) throw new Error(`${result.unexpected.length} new lint diagnostics; allowances cannot be added`)
  if (args[0] === '--prune') {
    writeFileSync(resolve(root, baselinePath), JSON.stringify({ version: 1, entries: result.entries }, null, 2) + '\n')
  } else {
    assert.equal(result.stale.length, 0, 'Resolved lint debt must be removed with pnpm lint --prune')
  }
  console.log(`Lint passed (${report.number_of_files} files; ${report.diagnostics.length} frozen TypeScript diagnostics)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
