import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { list, parseJson, readJson, record, requiredEnv, string } from './json.ts'
import { assertPrepareRun, readPlatformCandidate, readRuntimeCandidate } from './release-inputs.ts'
import { pinDocumentation } from './package-docs.ts'
import { releasePolicy, releaseCreateArgs, assertPublishedTags, assertPairedRuntimeRelease } from './release-policy.ts'
import { assertDshPin } from './verify-packages.ts'
const run = (cmd: string, args: readonly string[]) => execFileSync(cmd, args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 120_000,
}).trim()
const gh = (args: readonly string[]): unknown => parseJson(run('gh', args))
const env = process.env
assert.equal(env.GITHUB_REF, 'refs/heads/main')
assert.equal(env.GITHUB_REPOSITORY, 'GuoMonth/dsh-multi-tenant')
const platformCommit = requiredEnv('GITHUB_SHA')
assert.match(platformCommit, /^[a-f0-9]{40}$/)
const pkg = assertDshPin()
const packageName = string(pkg['name'], 'platform package name')
const policy = releasePolicy(pkg.version)
assert.equal(record(pkg['publishConfig'], 'npm publish config').tag, policy.channel)
assert.ok(['', 'false', 'true'].includes(env.PROMOTE_LATEST || ''), 'Invalid latest publication flag')
const publishLatest = env.PROMOTE_LATEST === 'true'
const publicationPolicy = publishLatest ? { ...policy, channel: 'latest' as const } : policy
const platformRunId = requiredEnv('PLATFORM_RUN'), runtimeRunId = requiredEnv('RUNTIME_RUN')
for (const id of [platformRunId, runtimeRunId]) assert.match(id, /^\d+$/)
assert.match(env.PACKAGE_INTEGRITY ?? '', /^sha512-[A-Za-z0-9+/]+={0,2}$/)
assert.match(env.WORKLOAD_DIGEST ?? '', /^sha256:[a-f0-9]{64}$/)
const runtimeTag = requiredEnv('RUNTIME_TAG')
assert.match(runtimeTag, /^v\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/)
const runtimePolicy = releasePolicy(runtimeTag.slice(1))
assert.equal(runtimePolicy.stage, policy.stage, 'Paired releases must use the same release stage')
const runtimeRepo = 'GuoMonth/dsh-isolated-runtime'
for (const [repo, id] of [[env.GITHUB_REPOSITORY, platformRunId], [runtimeRepo, runtimeRunId]] as const) {
  const commit = assertPrepareRun(gh(['api', `repos/${repo}/actions/runs/${id}`]))
  if (repo === env.GITHUB_REPOSITORY)
    assert.equal(commit, platformCommit, 'Candidate must be built from this exact source')
}
mkdirSync('publication', {
  recursive: true,
})
run('gh', ['run', 'download', platformRunId, '--repo', env.GITHUB_REPOSITORY, '--name', 'platform-candidate', '--dir', 'publication/platform'])
run('gh', ['run', 'download', runtimeRunId, '--repo', runtimeRepo, '--name', 'runtime-candidate', '--dir', 'publication/runtime'])
const p = readPlatformCandidate('publication/platform/candidate.json')
const r = readRuntimeCandidate('publication/runtime/candidate.json')
assert.equal(p.commit, platformCommit)
assert.equal(p.version, pkg.version)
assert.equal(p.repository, env.GITHUB_REPOSITORY)
assert.equal(p.package.name, packageName)
assert.deepEqual(p.dsh, pkg.dshRuntime)
assert.deepEqual(p.connector, readJson('vendor/environment-connector.json'))
assert.equal(r.repository, runtimeRepo)
assert.equal(r.version, runtimePolicy.version)
assert.deepEqual(r.dsh, pkg.dshRuntime)
assert.equal(p.package.filename, `dsh-multi-tenant-${pkg.version}.tgz`)
const artifact = resolve('publication/platform', p.package.filename)
const bytes = readFileSync(artifact)
const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64')
assert.equal(integrity, p.package.integrity)
assert.equal(integrity, env.PACKAGE_INTEGRITY)
assert.equal(r.workloadImage, `ghcr.io/guomonth/dsh-isolated-runtime@${env.WORKLOAD_DIGEST}`)
assert.match(p.platformImage, /^ghcr\.io\/guomonth\/dsh-multi-tenant@sha256:[a-f0-9]{64}$/)
assert.equal(r.commit, assertPrepareRun(gh(['api', `repos/${runtimeRepo}/actions/runs/${runtimeRunId}`])))
const ref = record(gh(['api', `repos/${runtimeRepo}/git/ref/tags/${runtimeTag}`]), 'runtime tag')
const target = record(ref.object, 'runtime tag target')
assert.equal(target.type, 'commit')
assert.equal(target.sha, r.commit)
const runtimeRelease = record(gh(['api', `repos/${runtimeRepo}/releases/tags/${runtimeTag}`]), 'runtime release')
assert.equal(runtimeRelease.draft, false)
assert.equal(runtimeRelease.prerelease, runtimePolicy.prerelease)
const assetsOf = (release: Record<string, unknown>) => list(release.assets, 'release assets').map(asset => record(asset, 'asset'))
const assetId = (asset: Record<string, unknown>): number => {
  const id = asset.id
  assert.ok(typeof id === 'number' && Number.isSafeInteger(id) && id > 0, 'Release asset ID is required')
  return id
}
const runtimeAsset = (name: string) => {
  const asset = assetsOf(runtimeRelease).find(asset => asset.name === name)
  assert.ok(asset, `Runtime release requires ${name}`)
  return run('gh', ['api', `repos/${runtimeRepo}/releases/assets/${assetId(asset)}`, '-H', 'Accept: application/octet-stream'])
}
assertPairedRuntimeRelease(parseJson(runtimeAsset('runtime-release.json')), {
  version: r.version,
  tag: runtimeTag,
  repository: runtimeRepo,
  commit: r.commit,
  workloadImage: r.workloadImage,
  dsh: pkg.dshRuntime,
  connector: p.connector,
  platform: {
    version: pkg.version, source: platformCommit, release: `https://github.com/${env.GITHUB_REPOSITORY}/releases/tag/${policy.tag}`,
  },
})
const validation = runtimeAsset('validation.md') + '\n'
for (const identity of [p.commit, r.commit, p.package.integrity, p.platformImage, r.workloadImage])
  assert.ok(validation.includes(identity), 'Validation report must identify the accepted candidates')
const tag = policy.tag
const existingTag = run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])
if (existingTag)
  assert.equal(existingTag.split(/\s/)[0], platformCommit, 'Never move a published tag')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const release = {
  version: pkg.version, tag, channel: publicationPolicy.channel, prerelease: policy.prerelease, platform: p, runtime: {
    ...r, tag: runtimeTag, release: runtimeRelease.html_url,
  }, controller: record(record(readJson('charts/dsh-platform/files/sources.json'), 'chart sources').core, 'controller source').image, package: {
    name: packageName, version: pkg.version, integrity, sha256,
  }, validation: 'validation.md',
}
writeFileSync('publication/release.json', JSON.stringify(release, null, 2) + '\n')
writeFileSync('publication/release-notes.md', pinDocumentation(readFileSync('docs/en/release-notes.md', 'utf8'), platformCommit))
writeFileSync('publication/validation.md', validation)
writeFileSync('publication/SHA256SUMS', `${sha256}  ${p.package.filename}\n${createHash('sha256').update(readFileSync('publication/release.json')).digest('hex')}  release.json\n${createHash('sha256').update(validation).digest('hex')}  validation.md\n`)
const registry = `https://registry.npmjs.org/${packageName}/${pkg.version}`
async function metadata() {
  const res = await fetch(`${registry}?release-check=${Date.now()}`, {
    signal: AbortSignal.timeout(20000),
  })
  if (res.status === 404)
    return null
  if (!res.ok)
    throw new Error(`Registry metadata HTTP ${res.status}`)
  const document: unknown = await res.json()
  const dist = record(record(document, 'registry metadata').dist, 'registry distribution')
  return { integrity: string(dist.integrity, 'registry integrity'), tarball: string(dist.tarball, 'registry tarball URL') }
}
let published = await metadata()
async function distTags() {
  const response = await fetch(`https://registry.npmjs.org/-/package/${packageName}/dist-tags?release-check=${Date.now()}`, {
    signal: AbortSignal.timeout(20000),
  })
  assert.equal(response.ok, true)
  const document: unknown = await response.json()
  return record(document, 'registry dist-tags')
}
const previousLatest = (await distTags()).latest
const previousLatestRelease = policy.prerelease ? record(gh(['api', `repos/${env.GITHUB_REPOSITORY}/releases/latest`]), 'latest release').id : null
if (published)
  assert.equal(published.integrity, integrity, 'Existing npm version differs; never overwrite')
else {
  run('npm', ['publish', '--dry-run', '--ignore-scripts', '--access', 'public', '--tag', publicationPolicy.channel, artifact])
  run('npm', ['publish', '--ignore-scripts', '--access', 'public', '--provenance', '--tag', publicationPolicy.channel, artifact])
}
for (let i = 0; i < 180; i++) {
  published = await metadata()
  if (published?.integrity === integrity) {
    const tags = await distTags()
    if (policy.prerelease && !publishLatest)
      assert.equal(tags.latest, previousLatest, 'Prerelease must preserve the default npm version')
    if (tags[publicationPolicy.channel] === pkg.version)
      break
  }
  await setTimeout(5000)
}
assert.ok(published?.integrity === integrity, 'Registry publication not yet verified; resume this exact run')
const response = await fetch(published.tarball, {
  signal: AbortSignal.timeout(60000),
})
assert.equal(response.ok, true)
assert.equal('sha512-' + createHash('sha512').update(Buffer.from(await response.arrayBuffer())).digest('base64'), integrity)
assertPublishedTags(await distTags(), publicationPolicy, previousLatest, { publishLatest })
if (!existingTag) {
  run('git', ['tag', tag, platformCommit])
  run('git', ['push', 'origin', tag])
}
const releases = list(gh(['release', 'list', '--limit', '100', '--json', 'tagName']), 'releases')
const paths = [artifact, 'publication/release.json', 'publication/SHA256SUMS', 'publication/validation.md']
if (!releases.some(release => record(release, 'release').tagName === tag))
  run('gh', releaseCreateArgs(policy, 'publication/release-notes.md', paths))
else {
  const assets = assetsOf(record(gh(['release', 'view', tag, '--json', 'assets']), 'release with assets'))
  const names = new Set(assets.map(x => x.name))
  const missing = paths.filter(x => !names.has(basename(x)))
  if (missing.length)
    run('gh', ['release', 'upload', tag, ...missing])
}
const finalRelease = record(gh(['api', `repos/${env.GITHUB_REPOSITORY}/releases/tags/${tag}`]), 'platform release')
assert.equal(finalRelease.draft, false)
assert.equal(finalRelease.prerelease, policy.prerelease)
for (const path of paths) {
  const asset = assetsOf(finalRelease).find(asset => asset.name === basename(path))
  assert.ok(asset)
  const downloaded: Buffer = execFileSync(
    'gh', ['api', `repos/${env.GITHUB_REPOSITORY}/releases/assets/${assetId(asset)}`, '-H', 'Accept: application/octet-stream'],
    { stdio: ['ignore', 'pipe', 'inherit'], timeout: 120_000 },
  )
  assert.equal(createHash('sha256').update(downloaded).digest('hex'), createHash('sha256').update(readFileSync(path)).digest('hex'), 'Published release asset differs; never overwrite')
}
if (policy.prerelease)
  assert.equal(record(gh(['api', `repos/${env.GITHUB_REPOSITORY}/releases/latest`]), 'latest release').id, previousLatestRelease)
console.log(`Verified npm ${packageName}@${pkg.version} on ${publicationPolicy.channel}, lightweight ${tag}, and matching GitHub Release`)
