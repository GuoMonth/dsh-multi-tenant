import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { DSH_TARGET } from './dsh-target.ts'
import { verifyPlatformShutdown } from './platform-process-smoke.ts'
const dir = mkdtempSync(join(tmpdir(), 'dsh-platform-consumer-'))
const run = (cmd: string, args: readonly string[], cwd = dir) => execFileSync(cmd, args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
try {
  run('npm', [
    'pack',
    resolve('packages/multi-tenant'),
    '--pack-destination',
    dir,
    '--ignore-scripts',
  ])
  const filename = readdirSync(dir).find(name => name.endsWith('.tgz'))
  assert.ok(filename, 'npm pack must produce an archive')
  const archive = join(dir, filename)
  const files = run('tar', ['-tzf', archive])
  const sourceCommit = run('git', ['rev-parse', 'HEAD'], process.cwd()).trim()
  for (const name of ['README.md', 'README.zh-CN.md', 'AI.md']) {
    const documentation = run('tar', ['-xOf', archive, `package/${name}`])
    assert.ok(documentation.includes(`/blob/${sourceCommit}/`))
    assert.ok(!documentation.includes('https://github.com/GuoMonth/dsh-multi-tenant/blob/main/'))
  }
  assert.doesNotMatch(files, /cell-platform|cell-admin|runtime\/|src\/native|experience\/|examples\//)
  assert.match(files, /^package\/charts\/install\.mjs$/m)
  assert.doesNotMatch(files, /^package\/charts\/.*\.ts$/m)
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    private: true, type: 'module',
  }))
  run('npm', [
    'install',
    '--engine-strict',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    archive,
  ])
  run('npm', [
    'install',
    '--engine-strict',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--save-dev',
    'typescript@6.0.3',
    '@types/node@22.20.1',
  ])
  writeFileSync(join(dir, 'consumer.mts'), `import { type AgentEnvironmentRuntime, type EnvironmentRuntimeOptions, EnvironmentBindingStore, createEnvironmentControl, createPlatformApplication, parsePlatformConfiguration } from 'dsh-multi-tenant';
declare const runtime: AgentEnvironmentRuntime;
declare const options: EnvironmentRuntimeOptions;
const store = new EnvironmentBindingStore('/private/state.sqlite');
createEnvironmentControl(runtime, store);
createPlatformApplication(parsePlatformConfiguration({}), undefined, () => runtime);
options.storage.size satisfies string;
`)
  run(process.execPath, [
    join(dir, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--target',
    'ES2024',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    'consumer.mts',
  ])
  const exports = run(process.execPath, [
    '--input-type=module',
    '-e',
    `import * as sdk from 'dsh-multi-tenant'; import assert from 'node:assert/strict'; assert.equal(sdk.DSH_RUNTIME_VERSION,${JSON.stringify(DSH_TARGET.version)}); assert.equal(typeof sdk.EnvironmentBindingStore,'function'); assert.ok(!('DockerRuntimeProvider' in sdk)); assert.ok(!('DomainRuntimeCoordinator' in sdk)); console.log(Object.keys(sdk).join(','));`,
  ])
  assert.match(exports, /\bENVIRONMENT_CONTRACT_VERSION\b/)
  assert.match(exports, /\bcreatePlatformApplication\b/)
  const cli = join(dir, 'node_modules/dsh-multi-tenant/dist/cli.mjs')
  assert.match(run(process.execPath, [cli, '--help']), /resume/)
  assert.match(run(process.execPath, [cli, '--version']), /^0\./)
  assert.match(run(process.execPath, [cli, '--help']), /preflight \| install/)
  const rendered = run(process.execPath, [cli, 'render', '--values', resolve('integration/installation/fixture.values.json'), '--namespace', 'dsh-package-smoke'])
  assert.match(rendered, /"kind": "Deployment"/)
  assert.match(rendered, /"kind": "PersistentVolumeClaim"/)
  assert.throws(() => run(process.execPath, [cli, 'docker']), (error) => {
    assert.ok(error instanceof Error && 'stderr' in error && typeof error.stderr === 'string')
    assert.match(error.stderr, /CLIStartupFailed/)
    return true
  })
  await verifyPlatformShutdown(cli, dir)
  console.log('Clean installed tarball import, bundled dependencies, CLI and deleted-backend rejection passed: ' +
        exports.trim())
}
finally {
  rmSync(dir, {
    recursive: true, force: true,
  })
}
