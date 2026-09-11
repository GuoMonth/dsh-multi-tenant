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

test('a wrong exact native runtime dependency fails the executable baseline gate', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-baseline-negative-'))
  try {
    mkdirSync(join(root, 'scripts/native-host-probe'), { recursive: true })
    mkdirSync(join(root, 'packages/multi-tenant/runtime'), { recursive: true })
    for (const file of ['scripts/verify-contract.mjs', 'scripts/dsh-target.mjs', 'scripts/native-host-probe/pnpm-lock.yaml', 'scripts/native-host-probe/package.json', 'packages/multi-tenant/package.json', 'packages/multi-tenant/runtime/package.json', 'packages/multi-tenant/runtime/package-lock.json']) {
      copyFileSync(new URL(`../../${file}`, import.meta.url), join(root, file))
    }
    const manifest = join(root, 'scripts/native-host-probe/package.json')
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    pkg.dependencies['@deepseek-ai/dsh'] = '0.0.0'
    writeFileSync(manifest, JSON.stringify(pkg))
    assert.throws(() => execFileSync(process.execPath, [join(root, 'scripts/verify-contract.mjs')], { stdio: 'pipe' }), error => {
      assert.match(String(error.stderr), /dsh runtime dependency must be exact/)
      return true
    })
  } finally { rmSync(root, { recursive: true, force: true }) }
})
