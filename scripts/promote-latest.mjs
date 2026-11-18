import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

assert.equal(process.env.GITHUB_REF, 'refs/heads/main')
assert.equal(process.env.GITHUB_REPOSITORY, 'GuoMonth/dsh-multi-tenant')
const release = JSON.parse(readFileSync('publication/release.json', 'utf8'))
assert.equal(release.platform.commit, process.env.GITHUB_SHA)
assert.equal(release.package.name, 'dsh-multi-tenant')
assert.equal(release.package.version, release.version)
const base = 'https://registry.npmjs.org'
const get = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
  assert.ok(response.ok, `Registry HTTP ${response.status}`)
  return response
}
const metadata = await (await get(`${base}/${release.package.name}/${release.version}`)).json()
assert.equal(metadata.dist.integrity, release.package.integrity)
const bytes = Buffer.from(await (await get(metadata.dist.tarball)).arrayBuffer())
assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), release.package.integrity)
assert.equal(createHash('sha256').update(bytes).digest('hex'), release.package.sha256)
const tags = async () => (await get(`${base}/-/package/${release.package.name}/dist-tags?verify=${Date.now()}`)).json()
const before = await tags()
assert.equal(before[release.channel], release.version)
if (before.latest !== release.version)
  execFileSync('npm', ['dist-tag', 'add', `${release.package.name}@${release.version}`, 'latest'], { stdio: 'inherit' })
const after = await tags()
assert.equal(after.latest, release.version)
assert.equal(after[release.channel], release.version)
console.log(`Verified npm ${release.package.name}@latest = ${release.version}; ${release.channel} retained`)
