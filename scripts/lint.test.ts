import assert from 'node:assert/strict'
import test from 'node:test'
import { assertNoGrowth, compareDiagnostics, fingerprint, validateBaseline } from './lint.ts'

const filename = 'packages/example/src/example.ts'
const source = 'const first: any = 1\nconst second = 2\n'
function diagnostic(text: string, token = 'any') {
  return {
    filename,
    code: 'typescript(no-explicit-any)',
    labels: [{ span: { offset: Buffer.byteLength(text.slice(0, text.indexOf(token))), length: token.length } }],
  }
}
const entry = { ...fingerprint(diagnostic(source), source), count: 1 }
const baseline = { version: 1, entries: [entry] }
const read = () => source

void test('allows only the exact existing statement and occurrence count', () => {
  const d = diagnostic(source)
  assert.equal(compareDiagnostics([d], baseline, read).unexpected.length, 0)
  assert.equal(compareDiagnostics([d, d], baseline, read).unexpected.length, 1)
  const changed = source.replace('first', 'third')
  assert.equal(compareDiagnostics([diagnostic(changed)], baseline, () => changed).unexpected.length, 1)
  assert.equal(compareDiagnostics([{ ...d, filename: 'packages/other/src/example.ts' }], baseline, read).unexpected.length, 1)
  assert.equal(compareDiagnostics([{ ...d, code: 'typescript(no-unsafe-assignment)' }], baseline, read).unexpected.length, 1)
})

void test('fingerprints survive formatting and account for UTF-8 diagnostic offsets', () => {
  const formatted = '// 中文 😀\nconst first : any = 1\n\nconst second = 2\n'
  assert.deepEqual(fingerprint(diagnostic(formatted), formatted), fingerprint(diagnostic(source), source))
  const stringA = "const first: any = 'value'\n"
  const stringB = 'const first: any = "value"\n'
  assert.deepEqual(fingerprint(diagnostic(stringA), stringA), fingerprint(diagnostic(stringB), stringB))
})

void test('cannot move an identical unsafe parameter to a different owner', () => {
  const first = 'function first(value: any) { return value }'
  const second = first.replace('first', 'second')
  assert.notDeepEqual(fingerprint(diagnostic(first), first), fingerprint(diagnostic(second), second))
})

void test('style and infrastructure errors cannot be hidden by the TypeScript baseline', () => {
  const d = { ...diagnostic(source), code: '@stylistic(semi)' }
  assert.equal(compareDiagnostics([d], baseline, read).unexpected.length, 1)
  assert.throws(() => fingerprint(d, source), /Only existing TypeScript debt/)
  assert.throws(() => validateBaseline({ version: 1, entries: [{ ...entry, code: d.code }] }))
})

void test('requires pruning resolved debt and rejects every allowance expansion', () => {
  assert.equal(compareDiagnostics([], baseline, read).stale.length, 1)
  assert.doesNotThrow(() => { assertNoGrowth({ version: 1, entries: [] }, baseline) })
  assert.throws(() => { assertNoGrowth({ version: 1, entries: [{ ...entry, count: 2 }] }, baseline) }, /cannot grow/)
  assert.throws(() => { assertNoGrowth(baseline, { version: 1, entries: [] }) }, /cannot grow/)
  assert.throws(() => { assertNoGrowth({ version: 1, entries: [{ ...entry, hash: 'a'.repeat(64) }] }, baseline) }, /cannot grow/)
})

void test('rejects invalid and duplicate baseline entries', () => {
  assert.throws(() => validateBaseline({ version: 2, entries: [] }))
  for (const bad of [{ count: 0 }, { hash: 'x' }, { file: '../outside.ts' }, { file: 'packages/../outside.ts' }]) {
    assert.throws(() => validateBaseline({ version: 1, entries: [{ ...entry, ...bad }] }))
  }
  assert.throws(() => validateBaseline({ version: 1, entries: [entry, entry] }), /Duplicate/)
})
