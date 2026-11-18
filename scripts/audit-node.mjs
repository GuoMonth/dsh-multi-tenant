import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const knownAdvisory = 'GHSA-fc5q-39xc-vjpf'
export const exceptionExpires = '2026-12-02T00:00:00Z'

export function assessAudit(report, { accepted = false, now = Date.now(), workloadVersions = [] } = {}) {
  assert.ok(report && !report.error && report.metadata?.vulnerabilities, 'Audit service must return a complete report')
  let findings
  if (report.advisories) findings = Object.values(report.advisories)
  else {
    assert.equal(report.auditReportVersion, 2, 'Unknown audit report schema')
    assert.ok(report.vulnerabilities)
    findings = []
    for (const item of Object.values(report.vulnerabilities)) {
      assert.ok(Array.isArray(item.via) && item.via.length, 'Unattributed vulnerability')
      for (const via of item.via) {
        if (typeof via === 'string') assert.ok(report.vulnerabilities[via], 'Missing advisory dependency')
        else findings.push(via)
      }
    }
  }
  assert.ok(Object.values(report.metadata.vulnerabilities).every(value => Number.isSafeInteger(value) && value >= 0))
  const count = Object.entries(report.metadata.vulnerabilities)
    .filter(([severity]) => severity !== 'total').reduce((sum, [, value]) => sum + value, 0)
  assert.equal(count === 0, findings.length === 0, 'Incomplete advisory attribution')
  if (!findings.length) return { knownIssues: [], auditClean: true }
  assert.ok(accepted, 'Known issue requires explicit release-owner acceptance')
  assert.ok(now < Date.parse(exceptionExpires), 'Known-issue acceptance expired')
  for (const finding of findings) {
    assert.equal(finding.url, `https://github.com/advisories/${knownAdvisory}`, 'Unaccepted security advisory')
    assert.equal(finding.module_name ?? finding.name, 'picomatch')
    if (finding.findings) {
      assert.ok(finding.findings.length)
      for (const installed of finding.findings) {
        assert.equal(installed.version, '4.0.7', 'Acceptance is limited to picomatch 4.0.7')
        assert.equal(installed.dev, true, 'Workspace exception covers development dependencies only')
      }
    }
    else {
      assert.equal(finding.dependency, 'picomatch')
      assert.ok(workloadVersions.length && workloadVersions.every(version => version === '4.0.7'), 'Workload version changed')
    }
  }
  return { auditClean: false, knownIssues: [{ advisory: knownAdvisory, package: 'picomatch', version: '4.0.7', expires: exceptionExpires }] }
}

function main() {
  const args = process.argv.slice(2)
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--workload'))
  const workload = args.length === 1
  const acceptance = process.env.ACCEPT_PICOMATCH_GHSA || ''
  assert.ok(acceptance === '' || acceptance === knownAdvisory, 'Unknown acceptance value')
  const result = spawnSync(workload ? 'npm' : 'pnpm', workload
    ? ['audit', '--prefix', 'images/environment', '--omit=dev', '--audit-level=low', '--json']
    : ['audit', '--audit-level', 'low', '--json'], { encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024 })
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  if (result.error) throw result.error
  assert.ok(result.status === 0 || result.status === 1, 'Audit command failed')
  const workloadVersions = workload ? Object.entries(JSON.parse(readFileSync('images/environment/package-lock.json')).packages)
    .filter(([path]) => path.endsWith('/picomatch')).map(([, pkg]) => pkg.version) : []
  const report = JSON.parse(result.stdout)
  const assessment = assessAudit(report, { accepted: acceptance === knownAdvisory, workloadVersions })
  if (process.env.AUDIT_EVIDENCE_DIRECTORY) {
    const directory = resolve(process.env.AUDIT_EVIDENCE_DIRECTORY)
    mkdirSync(directory, { recursive: true })
    const name = workload ? 'workload' : 'workspace'
    writeFileSync(resolve(directory, `${name}-raw.json`), JSON.stringify(report, null, 2) + '\n')
    writeFileSync(resolve(directory, `${name}-assessment.json`), JSON.stringify(assessment, null, 2) + '\n')
  }
  console.log(JSON.stringify({ securityAssessment: assessment }))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
