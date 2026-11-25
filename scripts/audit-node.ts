import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { list, parseJson, readJson, record, string } from './json.ts'

export const knownAdvisory = 'GHSA-fc5q-39xc-vjpf'
export const exceptionExpires = '2026-12-02T00:00:00Z'

export function assessAudit(value: unknown, { accepted = false, now = Date.now(), workloadVersions = [] }: {
  accepted?: boolean
  now?: number
  workloadVersions?: readonly string[]
} = {}) {
  const report = record(value, 'audit report')
  assert.ok(!report.error, 'Audit service must return a complete report')
  const metadata = record(report.metadata, 'audit metadata')
  const counts = record(metadata.vulnerabilities, 'audit severity counts')
  const findings: unknown[] = []
  if (report.advisories) findings.push(...Object.values(record(report.advisories, 'pnpm advisories')))
  else {
    assert.equal(report.auditReportVersion, 2, 'Unknown audit report schema')
    const vulnerabilities = record(report.vulnerabilities, 'npm vulnerabilities')
    for (const entry of Object.values(vulnerabilities)) {
      const item = record(entry, 'npm vulnerability')
      const sources = list(item.via, 'vulnerability sources')
      assert.ok(sources.length, 'Unattributed vulnerability')
      for (const source of sources) {
        if (typeof source === 'string') assert.ok(Object.hasOwn(vulnerabilities, source), 'Missing advisory dependency')
        else findings.push(source)
      }
    }
  }
  let count = 0
  for (const [severity, occurrences] of Object.entries(counts)) {
    assert.ok(typeof occurrences === 'number' && Number.isSafeInteger(occurrences) && occurrences >= 0)
    if (severity !== 'total') count += occurrences
  }
  assert.equal(count === 0, findings.length === 0, 'Incomplete advisory attribution')
  if (!findings.length) return { knownIssues: [], auditClean: true }
  assert.ok(accepted, 'Known issue requires explicit release-owner acceptance')
  assert.ok(now < Date.parse(exceptionExpires), 'Known-issue acceptance expired')
  for (const entry of findings) {
    const finding = record(entry, 'audit finding')
    assert.equal(finding.url, `https://github.com/advisories/${knownAdvisory}`, 'Unaccepted security advisory')
    assert.equal(finding.module_name ?? finding.name, 'picomatch')
    if (finding.findings) {
      const installations = list(finding.findings, 'affected installations')
      assert.ok(installations.length)
      for (const value of installations) {
        const installed = record(value, 'affected installation')
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
  const workloadLock = workload ? record(readJson('images/environment/package-lock.json'), 'workload lockfile') : undefined
  const workloadVersions = workloadLock ? Object.entries(record(workloadLock.packages, 'workload packages'))
    .filter(([path]) => path.endsWith('/picomatch'))
    .map(([, pkg]) => string(record(pkg, 'workload picomatch').version, 'workload picomatch version')) : []
  const report = parseJson(result.stdout)
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
