import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
import { isRecord, list, parseJson, readJson, record, string } from './json.ts'

interface Diagnostic {
  filename: string
  code: string
  message?: string
  labels: { span: { offset: number; line?: number; column?: number } }[]
}

interface Allowance {
  file: string
  code: string
  hash: string
  count: number
}

const root = resolve(import.meta.dirname, '..')
const baselinePath = `${relative(root, import.meta.dirname)}/lint-baseline.json`
const key = (entry: Pick<Allowance, 'file' | 'code' | 'hash'>) => JSON.stringify([entry.file, entry.code, entry.hash])

function hasIdentifier(node: ts.Node): node is ts.Node & { name: ts.Identifier } {
  return 'name' in node && isRecord(node.name) && node.name.kind === ts.SyntaxKind.Identifier
}

/** Fingerprint the owning statement, excluding comments, spacing and quote choice. */
export function fingerprint(diagnostic: Diagnostic, source: string) {
  assert.match(diagnostic.code, /^typescript\([a-z-]+\)$/u, 'Only existing TypeScript debt can be baselined')
  const span = diagnostic.labels[0]?.span
  assert.ok(span, 'A baselined diagnostic must have a source span')
  const offset = Buffer.from(source).subarray(0, span.offset).toString('utf8').length
  const file = ts.createSourceFile(diagnostic.filename, source, ts.ScriptTarget.Latest, true)
  let owner: ts.Node = file
  const visit = (node: ts.Node) => {
    if (offset < node.getFullStart() || offset >= node.end) return
    if (ts.isStatement(node) || ts.isPropertySignature(node) || ts.isParameter(node)) owner = node
    ts.forEachChild(node, visit)
  }
  visit(file)
  const owners = []
  for (let node = owner.parent; node && node !== file; node = node.parent) {
    if (hasIdentifier(node)) owners.push(node.name.text)
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

export function validateBaseline(input: unknown): { version: 1; entries: Allowance[] } {
  const baseline = record(input, 'lint baseline')
  assert.equal(baseline.version, 1, 'Unsupported lint baseline')
  const seen = new Set()
  const entries = list(baseline.entries, 'lint allowances').map((input) => {
    const { file: rawFile, code: rawCode, hash: rawHash, count } = record(input, 'lint allowance')
    const file = string(rawFile, 'allowance file'), code = string(rawCode, 'allowance rule'), hash = string(rawHash, 'allowance hash')
    assert.match(file, /^(?:packages|integration)\/(?!.*\.\.\/).+\.ts$/u)
    assert.match(code, /^typescript\([a-z-]+\)$/u)
    assert.match(hash, /^[a-f0-9]{64}$/u)
    assert.ok(typeof count === 'number' && Number.isSafeInteger(count) && count > 0)
    const entry = { file, code, hash, count }
    assert.ok(!seen.has(key(entry)), 'Duplicate lint allowance')
    seen.add(key(entry))
    return entry
  })
  return { version: 1, entries }
}

/** A committed allowance may only be removed or reduced. */
export function assertNoGrowth(current: unknown, previous: unknown): void {
  const limits = new Map(validateBaseline(previous).entries.map(entry => [key(entry), entry.count]))
  for (const entry of validateBaseline(current).entries) {
    assert.ok(entry.count <= (limits.get(key(entry)) ?? 0), `Lint baseline cannot grow: ${entry.file} ${entry.code}`)
  }
}

export function compareDiagnostics(diagnostics: readonly Diagnostic[], baseline: unknown, readSource: (filename: string) => string) {
  const { entries } = validateBaseline(baseline)
  const expected = new Map(entries.map(entry => [key(entry), entry.count]))
  const observed = new Map<string, Allowance>()
  const unexpected: Diagnostic[] = []
  for (const diagnostic of diagnostics) {
    if (!/^typescript\([a-z-]+\)$/u.test(diagnostic.code)) {
      unexpected.push(diagnostic)
      continue
    }
    const entry = fingerprint(diagnostic, readSource(diagnostic.filename))
    const id = key(entry)
    const count = (observed.get(id)?.count ?? 0) + 1
    observed.set(id, { ...entry, count })
    if (count > (expected.get(id) ?? 0)) unexpected.push(diagnostic)
  }
  const stale = entries.filter(entry => (observed.get(key(entry))?.count ?? 0) !== entry.count)
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
  return validateBaseline(parseJson(content.stdout))
}

function parseDiagnostic(input: unknown): Diagnostic {
  const { filename, code, message, labels } = record(input, 'lint diagnostic')
  return {
    filename: string(filename, 'diagnostic filename'),
    code: typeof code === 'string' ? code : '',
    message: string(message, 'diagnostic message'),
    labels: list(labels ?? [], 'diagnostic labels').map((label) => {
      const span = record(record(label, 'diagnostic label').span, 'diagnostic span')
      assert.ok(typeof span.offset === 'number')
      return {
        span: {
          offset: span.offset,
          ...(typeof span.line === 'number' ? { line: span.line } : {}),
          ...(typeof span.column === 'number' ? { column: span.column } : {}),
        },
      }
    }),
  }
}

function main() {
  const args = process.argv.slice(2)
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--prune'), 'Usage: lint.ts [--prune]')
  const baseline = validateBaseline(readJson(resolve(root, baselinePath)))
  const trusted = trustedBaseline()
  if (trusted) assertNoGrowth(baseline, trusted)
  const run = spawnSync(process.execPath, [resolve(root, 'node_modules/oxlint/bin/oxlint'), '--format', 'json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (run.error) throw run.error
  assert.ok(run.status === 0 || run.status === 1, run.stderr || `Oxlint terminated: ${run.signal ?? run.status}`)
  const report = record(parseJson(run.stdout), 'Oxlint report')
  const diagnostics = list(report.diagnostics, 'Oxlint diagnostics').map(parseDiagnostic)
  assert.ok(run.status === 0 || diagnostics.length > 0, 'Oxlint failed without diagnostics')
  const result = compareDiagnostics(diagnostics, baseline, filename => readFileSync(resolve(root, filename), 'utf8'))
  for (const diagnostic of result.unexpected.slice(0, 30)) {
    const span = diagnostic.labels[0]?.span
    console.error(`${diagnostic.filename}:${span?.line ?? 0}:${span?.column ?? 0} ${diagnostic.code}: ${diagnostic.message}`)
  }
  if (result.unexpected.length) throw new Error(`${result.unexpected.length} new lint diagnostics; allowances cannot be added`)
  if (args[0] === '--prune') {
    writeFileSync(resolve(root, baselinePath), JSON.stringify({ version: 1, entries: result.entries }, null, 2) + '\n')
  } else {
    assert.equal(result.stale.length, 0, 'Resolved lint debt must be removed with pnpm lint --prune')
  }
  assert.ok(typeof report.number_of_files === 'number')
  console.log(`Lint passed (${report.number_of_files} files; ${diagnostics.length} frozen TypeScript diagnostics)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
