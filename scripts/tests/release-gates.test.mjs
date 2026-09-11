import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { assertExportFiles } from '../artifact-contract.mjs'

test('declared exports must exist, including declarations', () => {
  const exports = { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' } }
  assert.doesNotThrow(() => assertExportFiles(exports, () => true))
  assert.throws(() => assertExportFiles(exports, path => !path.endsWith('.d.mts')), /export target missing/)
  assert.throws(() => assertExportFiles({}, () => true), /exports missing/)
})

test('a wrong exact upstream peer fails the executable baseline gate', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-baseline-negative-'))
  try {
    mkdirSync(join(root, 'scripts'))
    mkdirSync(join(root, 'packages/multi-tenant'), { recursive: true })
    for (const file of ['scripts/verify-contract.mjs', 'scripts/dsh-target.mjs', 'pnpm-lock.yaml', 'packages/multi-tenant/package.json']) {
      copyFileSync(new URL(`../../${file}`, import.meta.url), join(root, file))
    }
    const manifest = join(root, 'packages/multi-tenant/package.json')
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    pkg.peerDependencies['@deepseek-ai/dsh-agent'] = '0.0.0'
    writeFileSync(manifest, JSON.stringify(pkg))
    assert.throws(() => execFileSync(process.execPath, [join(root, 'scripts/verify-contract.mjs')], { stdio: 'pipe' }), error => {
      assert.match(String(error.stderr), /dsh-agent peer must be exact/)
      return true
    })
  } finally { rmSync(root, { recursive: true, force: true }) }
})
