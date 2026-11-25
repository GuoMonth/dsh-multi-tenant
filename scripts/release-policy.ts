import assert from 'node:assert/strict'
import { record } from './json.ts'

type ReleaseChannel = 'latest' | 'alpha' | 'next'

export function releasePolicy(version: string) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(version)
  assert.ok(match, 'Use a stable version or alpha/beta/rc.N')
  const stage = match[4] ?? 'stable'
  const channel: ReleaseChannel = stage === 'stable' ? 'latest' : stage === 'alpha' ? 'alpha' : 'next'
  return {
    version,
    tag: `v${version}`,
    stage,
    channel,
    prerelease: stage !== 'stable',
  }
}

export function releaseCreateArgs(policy: ReturnType<typeof releasePolicy>, notes: string, assets: readonly string[]): string[] {
  return ['release', 'create', policy.tag, '--verify-tag',
    ...(policy.prerelease ? ['--prerelease', '--latest=false'] : ['--latest']),
    '--title', policy.tag, '--notes-file', notes, ...assets]
}

export function assertPublishedTags(
  tags: Record<string, unknown>, policy: ReturnType<typeof releasePolicy>, previousLatest: unknown, { publishLatest = false } = {},
): void {
  assert.equal(tags[policy.channel], policy.version, 'Published channel must resolve to the accepted version')
  if (publishLatest) assert.equal(tags.latest, policy.version, 'Explicit latest publication must select the accepted version')
  else if (policy.prerelease) assert.equal(tags.latest, previousLatest, 'Prerelease must preserve the default npm version')
}

export function assertPairedRuntimeRelease(value: unknown, expected: {
  version: string
  tag: string
  repository: string
  commit: string
  workloadImage: string
  dsh: unknown
  connector: Record<string, unknown>
  platform: unknown
}): void {
  const manifest = record(value, 'runtime release manifest')
  for (const key of ['version', 'tag', 'repository', 'commit', 'workloadImage'] as const)
    assert.equal(manifest[key], expected[key], `Runtime release ${key} differs from the accepted candidate`)
  assert.deepEqual(manifest.dsh, expected.dsh, 'Runtime DSH identity differs')
  const connector = record(manifest.connector, 'runtime release Connector')
  for (const key of ['repository', 'commit', 'artifact', 'sha256', 'integrity'])
    assert.equal(connector[key], expected.connector[key], `Runtime Connector ${key} differs`)
  assert.deepEqual(manifest.platform, expected.platform, 'Runtime must name this exact paired platform release')
}
