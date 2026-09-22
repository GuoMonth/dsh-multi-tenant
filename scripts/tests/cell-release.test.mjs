import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { verifyCellRelease } from '../cell-release-contract.mjs'
const root = new URL('../../', import.meta.url)
const candidate = JSON.parse(readFileSync(new URL('packages/multi-tenant/cell-release.json', root), 'utf8'))
const packageJson = JSON.parse(readFileSync(new URL('packages/multi-tenant/package.json', root), 'utf8'))
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

test('an already bound combination cannot silently change release or image digests', () => {
  const bound = { ...expected, runtime: { ...expected.runtime, release: accepted.version }, images }
  assert.doesNotThrow(() => verifyCellRelease(bound, accepted, accepted.version, images))
  const changedImages = { ...images, cell: 'another-public-cell-digest' }
  assert.throws(() => verifyCellRelease(bound, { ...accepted, images: changedImages }, accepted.version, changedImages), /combination mismatch/)
  const nextTag = 'v0.3.0-alpha.1'
  assert.throws(() => verifyCellRelease(bound, { ...accepted, version: nextTag }, nextTag, images), /combination mismatch/)
})

test('unpublished platform candidate never claims the old public runtime images', () => {
  assert.equal(packageJson.version, '0.10.0-alpha.1')
  assert.equal(candidate.platformVersion, packageJson.version)
  assert.equal(candidate.status, 'source-candidate')
  assert.equal(candidate.runtime.commit, 'source-candidate')
  assert.equal(candidate.runtime.release, null)
  assert.equal(candidate.connector.commit, 'source-candidate')
  assert.equal(candidate.connector.artifact, null)
  assert.equal(candidate.connector.sha256, null)
  assert.deepEqual(candidate.images, { cell: null, operator: null })
  assert.equal(candidate.dsh.version, '0.1.5-rc.2')
  assert.equal(candidate.dsh.commit, 'fb2c4b9e698e30edb738bca4cf0618587db7d203')
});
