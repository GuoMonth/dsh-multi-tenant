import test from 'node:test'
import assert from 'node:assert/strict'
import { assessAudit, knownAdvisory, exceptionExpires } from './audit-node.mjs'

const known = { module_name: 'picomatch', url: `https://github.com/advisories/${knownAdvisory}`,
  findings: [{ version: '4.0.7', dev: true }] }
const workspace = () => ({ metadata: { vulnerabilities: { high: 1 } }, advisories: { known: structuredClone(known) } })
const options = { accepted: true, now: Date.parse('2026-11-18T00:00:00Z') }
test('acceptance is explicit, version-scoped and expires; raw findings remain known issues', () => {
  assert.throws(() => assessAudit(workspace()))
  const result = assessAudit(workspace(), options)
  assert.equal(result.auditClean, false)
  assert.equal(result.knownIssues[0].advisory, knownAdvisory)
  for (const mutate of [
    (finding) => { finding.url = 'https://github.com/advisories/OTHER' },
    (finding) => { finding.findings[0].version = '4.0.6' },
    (finding) => { finding.findings[0].dev = false },
  ]) {
    const report = workspace(); mutate(report.advisories.known)
    assert.throws(() => assessAudit(report, options))
  }
  assert.throws(() => assessAudit(workspace(), { ...options, now: Date.parse(exceptionExpires) }))
})
test('npm propagation is attributed to the exact advisory; extra and malformed reports fail', () => {
  const report = { auditReportVersion: 2, metadata: { vulnerabilities: { high: 2, total: 2 } }, vulnerabilities: {
    parent: { via: ['picomatch'] }, picomatch: { via: [{ name: 'picomatch', dependency: 'picomatch', url: known.url }] },
  } }
  assert.equal(assessAudit(report, { ...options, workloadVersions: ['4.0.7'] }).knownIssues.length, 1)
  assert.throws(() => assessAudit(report, { ...options, workloadVersions: ['4.0.8'] }))
  report.vulnerabilities.picomatch.via.push({ name: 'other', url: 'https://github.com/advisories/OTHER' })
  assert.throws(() => assessAudit(report, { ...options, workloadVersions: ['4.0.7'] }))
  for (const invalid of [{ error: {} }, { metadata: { vulnerabilities: { high: 1 } }, advisories: {} }])
    assert.throws(() => assessAudit(invalid, options))
})
test('a clean complete scan needs no exception', () => {
  assert.deepEqual(assessAudit({ metadata: { vulnerabilities: { high: 0 } }, advisories: {} }), { knownIssues: [], auditClean: true })
})
