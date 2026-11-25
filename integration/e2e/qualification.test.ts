import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DSH_TARGET } from '../../scripts/dsh-target.ts'
import { readJson, record } from '../../scripts/json.ts'
import { projectResource } from './cluster-state.ts'

void test('failure projection applies the Pod allowlist when the item omits TypeMeta', () => {
  const item = {
    metadata: { name: 'pod', annotations: { 'environment.dsh.io/revision': '123', 'unrelated/credential': 'private' } },
    spec: { containers: [{ name: 'dsh', image: 'fixture', env: [{ name: 'TOKEN', value: 'private' }] }] },
  }
  const result = projectResource(item, 'Pod')
  assert.equal(result.kind, 'Pod')
  assert.deepEqual(record(result.spec, 'Pod projection').containers, [{ name: 'dsh', image: 'fixture' }])
  assert.doesNotMatch(JSON.stringify(result), /private/)
  assert.throws(() => { projectResource({ ...item, kind: 'Secret' }, 'Pod') }, /Unexpected resource kind/)
})

void test('qualification verifies frozen candidates and keeps failed command stderr private', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-qualify-test-'))
  try {
    const bin = join(root, 'bin'), candidates = join(root, 'candidates')
    for (const directory of [bin, join(candidates, 'platform'), join(candidates, 'runtime')])
      mkdirSync(directory, { recursive: true })
    writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node
const path = process.argv[3]
if (process.env.FIXTURE_EXIT) {
  process.stderr.write('private-stderr-marker\\n')
  process.exit(9)
}
if (!path.includes('/actions/runs/')) process.exit(8)
process.stdout.write(JSON.stringify({
  conclusion: 'success', head_branch: 'main', event: 'workflow_dispatch',
  path: '.github/workflows/prepare-release.yml',
  head_sha: (path.includes('dsh-isolated-runtime') ? 'b' : 'a').repeat(40),
}))
`, { mode: 0o755 })
    const version = record(readJson('packages/multi-tenant/package.json'), 'platform package').version
    assert.ok(typeof version === 'string')
    const filename = `dsh-multi-tenant-${version}.tgz`
    const bytes = Buffer.from('accepted archive')
    const digest = 'sha256:' + 'c'.repeat(64)
    const { version: dshVersion, commit } = DSH_TARGET
    const dsh = { version: dshVersion, commit }
    writeFileSync(join(candidates, 'platform', filename), bytes)
    writeFileSync(join(candidates, 'platform', 'candidate.json'), JSON.stringify({
      repository: 'GuoMonth/dsh-multi-tenant', version, runId: '1', commit: 'a'.repeat(40), dsh,
      platformImage: 'ghcr.io/guomonth/dsh-multi-tenant@' + digest,
      connector: readJson('vendor/environment-connector.json'),
      package: { name: 'dsh-multi-tenant', filename, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') },
    }))
    writeFileSync(join(candidates, 'runtime', 'candidate.json'), JSON.stringify({
      repository: 'GuoMonth/dsh-isolated-runtime', version: '0.5.0-rc.4', runId: '2', commit: 'b'.repeat(40), dsh,
      workloadImage: 'ghcr.io/guomonth/dsh-isolated-runtime@' + digest,
    }))
    const run = (attempt: string, fail = false) => spawnSync(process.execPath,
      [fileURLToPath(new URL('qualify-release.ts', import.meta.url)), '--verify-only'], {
        encoding: 'utf8', timeout: 10_000,
        env: {
          ...process.env, PATH: bin + delimiter + (process.env.PATH ?? ''),
          QUALIFICATION_ROOT: join(root, attempt), CANDIDATE_ROOT: candidates, PLATFORM_RUN: '1', RUNTIME_RUN: '2',
          ...(fail ? { FIXTURE_EXIT: '1' } : {}),
        },
      })
    const accepted = run('accepted')
    assert.equal(accepted.status, 0, accepted.stderr)
    assert.match(accepted.stdout, /"candidateIdentity":"passed"/)
    assert.equal(record(readJson(join(root, 'accepted/evidence/release-inputs.json')), 'release inputs').releaseReady, false)

    const rejected = run('rejected', true)
    assert.notEqual(rejected.status, 0)
    assert.doesNotMatch(rejected.stdout + rejected.stderr, /private-stderr-marker/)
    assert.deepEqual(readdirSync(join(root, 'rejected/evidence')), [])
    assert.match(readFileSync(join(root, 'rejected/private/failure-1-gh.log'), 'utf8'), /private-stderr-marker/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
