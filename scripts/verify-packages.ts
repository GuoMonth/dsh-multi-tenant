import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_TARGET } from './dsh-target.ts'
import { readJson, record, string, parseJson } from './json.ts'
import { releasePolicy } from './release-policy.ts'

const text = (root: string, path: string) => readFileSync(resolve(root, path), 'utf8')
const scalar = (body: string, key: string) =>
  body.match(new RegExp(`^${key}:\\s*(\\S+)\\s*$`, 'm'))?.[1]?.replace(/^["']|["']$/g, '')

/** Source text the consumer smoke must use so its expected version cannot diverge. */
export const DSH_SMOKE_ASSERT =
  'assert.equal(sdk.DSH_RUNTIME_VERSION,${JSON.stringify(DSH_TARGET.version)})'

type PlatformPin = Record<string, unknown> & {
  version: string
  dshRuntime: { version: string; commit: string }
}

export function assertDshPin(root = process.cwd()): PlatformPin {
  const pkg = record(readJson(resolve(root, 'packages/multi-tenant/package.json')), 'platform package')
  const version = string(pkg.version, 'platform package version')
  const pin = { version: DSH_TARGET.version, commit: DSH_TARGET.commit }
  assert.deepEqual(pkg.dshRuntime, pin, 'package dshRuntime must match scripts/dsh-target.ts')
  const sources = record(readJson(resolve(root, 'charts/dsh-platform/files/sources.json')), 'chart sources')
  assert.deepEqual(sources.dsh, pin, 'sources.json dsh must match scripts/dsh-target.ts')
  const chart = text(root, 'charts/dsh-platform/Chart.yaml')
  assert.equal(scalar(chart, 'appVersion'), DSH_TARGET.version, 'Chart appVersion is the DSH pin')
  const chartVersion = scalar(chart, 'version')
  assert.ok(chartVersion, 'Chart version is required')
  assert.notEqual(chartVersion, DSH_TARGET.version, 'Chart version is the chart revision, not the DSH pin')
  assert.notEqual(chartVersion, pkg.version, 'Chart version is not the platform npm version')
  const exported = text(root, 'packages/multi-tenant/src/index.ts').match(
    /export const DSH_RUNTIME_VERSION = ['"]([^'"]*)['"]/,
  )?.[1]
  assert.equal(exported, DSH_TARGET.version, 'DSH_RUNTIME_VERSION must match scripts/dsh-target.ts')
  const smoke = text(root, 'scripts/artifact-consumer-smoke.ts')
  assert.equal(smoke.includes(DSH_TARGET.version), false, 'smoke must not copy the DSH version literal')
  assert.equal(smoke.includes(DSH_TARGET.commit), false, 'smoke must not copy the DSH commit literal')
  assert.ok(smoke.includes(DSH_SMOKE_ASSERT), 'smoke must assert sdk.DSH_RUNTIME_VERSION from scripts/dsh-target.ts')
  return { ...pkg, version, dshRuntime: pin }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = assertDshPin()
  const pin = record(readJson('vendor/environment-connector.json'), 'Connector provenance')
  const artifact = string(pin.artifact, 'Connector archive')
  assert.equal(record(pkg['publishConfig'], 'npm publish config').tag, releasePolicy(pkg.version).channel)
  assert.deepEqual(Object.keys(record(pkg['exports'], 'package exports')), ['.'])
  assert.deepEqual(pkg['bin'], { 'dsh-multi-tenant': 'dist/cli.mjs' })
  const archive = readFileSync('vendor/' + artifact)
  assert.equal(createHash('sha256').update(archive).digest('hex'), pin.sha256)
  assert.equal(
    'sha512-' + createHash('sha512').update(archive).digest('base64'),
    pin.integrity,
  )
  const source = record(parseJson(
    execFileSync(
      'tar',
      ['-xOf', 'vendor/' + artifact, 'package/source.json'],
      { encoding: 'utf8' },
    ),
  ), 'Connector source')
  assert.equal(source.repository, pin.repository)
  assert.equal(source.commit, pin.commit)
  assert.equal(
    record(pkg['devDependencies'], 'package development dependencies')['@dsh/environment-connector-internal'],
    'file:../../vendor/' + artifact,
  )
  assert.ok(readFileSync('docs/en/release-notes.md', 'utf8').startsWith(`# ${pkg.version}\n`))
  assert.ok(!readdirSync('vendor').some(n => n.includes('cell')))
  console.log(
    'Exact DSH/connector pin, public exports and release-note version verified',
  )
}
