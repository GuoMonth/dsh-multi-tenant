import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseJson, record, string } from './json.ts'
import { DSH_TARGET } from './dsh-target.ts'
import { assertDshPin, DSH_SMOKE_ASSERT } from './verify-packages.ts'
type MutateFixture = (files: Record<string, string>) => void
function tree(mutate?: MutateFixture) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pin-'))
  const pin = {
    version: DSH_TARGET.version, commit: DSH_TARGET.commit,
  }
  const files = {
    'packages/multi-tenant/package.json': JSON.stringify({
      version: '0.12.0-rc.1', dshRuntime: pin,
    }),
    'charts/dsh-platform/files/sources.json': JSON.stringify({
      dsh: pin,
    }),
    'charts/dsh-platform/Chart.yaml': `apiVersion: v2\nname: dsh-platform\nversion: 0.1.0\nappVersion: ${pin.version}\n`,
    'packages/multi-tenant/src/index.ts': `export const DSH_RUNTIME_VERSION = "${pin.version}";\n`,
    'scripts/artifact-consumer-smoke.ts': `import { parseJson, record, string } from './json.ts'
import { DSH_TARGET } from "./dsh-target.ts";\n${DSH_SMOKE_ASSERT};\n`,
  }
  mutate?.(files)
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), {
      recursive: true,
    })
    writeFileSync(join(root, name), body)
  }
  return root
}
void test('DSH copies match the single dsh-target pin', () => {
  const root = tree()
  try {
    assert.equal(assertDshPin(root).dshRuntime.commit, DSH_TARGET.commit)
  }
  finally {
    rmSync(root, {
      recursive: true, force: true,
    })
  }
})
void test('Chart appVersion, the public constant and smoke cannot drift from dsh-target', () => {
  const drifted: readonly [MutateFixture, RegExp][] = [
    [(files) => {
      files['charts/dsh-platform/Chart.yaml'] = 'version: 0.1.0\nappVersion: 0.0.0-rc.9\n'
    }, /Chart appVersion/],
    [(files) => {
      const sources = record(parseJson(string(files['charts/dsh-platform/files/sources.json'], 'sources')), 'sources')
      record(sources.dsh, 'DSH identity').commit = '0'.repeat(40)
      files['charts/dsh-platform/files/sources.json'] = JSON.stringify(sources)
    }, /sources\.json/],
    [(files) => {
      files['packages/multi-tenant/src/index.ts'] = 'export const DSH_RUNTIME_VERSION = "0.0.0-rc.9";\n'
    }, /DSH_RUNTIME_VERSION/],
    [(files) => {
      files['scripts/artifact-consumer-smoke.ts'] = `assert.equal(sdk.DSH_RUNTIME_VERSION,'${DSH_TARGET.version}');\n`
    }, /smoke must not copy/],
    [(files) => {
      files['charts/dsh-platform/Chart.yaml'] = `version: ${DSH_TARGET.version}\nappVersion: ${DSH_TARGET.version}\n`
    }, /chart revision/],
    [(files) => {
      const pkg = record(parseJson(string(files['packages/multi-tenant/package.json'], 'package')), 'package')
      files['charts/dsh-platform/Chart.yaml'] = `version: ${string(pkg.version, 'package version')}\nappVersion: ${DSH_TARGET.version}\n`
    }, /platform npm version/],
  ]
  for (const [mutate, message] of drifted) {
    const root = tree(mutate)
    try {
      assert.throws(() => assertDshPin(root), message)
    }
    finally {
      rmSync(root, {
        recursive: true, force: true,
      })
    }
  }
})
