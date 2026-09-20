import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyCellRelease } from '../cell-release-contract.mjs'
const expected = { runtime: { commit: 'current-runtime' }, dsh: { version: '0.1.5-rc.2', commit: 'current-dsh' } }
const images = { cell: 'cell-digest', operator: 'operator-digest' }
const accepted = { sourceSHA: 'current-runtime', version: 'v0.2.0-alpha.2', baseline: { source: expected.dsh }, images }
test('release binding rejects old runtime/DSH and mixed image pairs', () => {
  assert.doesNotThrow(() => verifyCellRelease(expected, accepted, accepted.version, images))
  for (const candidate of [
    { ...accepted, sourceSHA: 'old-standalone' },
    { ...accepted, baseline: { source: { ...expected.dsh, commit: 'other-dsh' } } },
    { ...accepted, images: { ...images, operator: 'other-operator' } },
    { ...accepted, version: 'v0.2.0-alpha.1' },
    {}, null,
  ]) assert.throws(() => verifyCellRelease(expected, candidate, accepted.version, images), /combination mismatch/)
})
