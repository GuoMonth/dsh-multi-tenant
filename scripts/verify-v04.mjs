#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { DSH_TARGET } from './dsh-target.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'packages/multi-tenant/package.json'), 'utf8'))
const errors = []
const expectedVersion = '0.4.0-alpha.3'
const expectedDsh = '0.1.2-rc.1'
const expectedCommit = 'a66e4702047846cdaa10c66c9d3df3951f5ea70d'
const expectedExports = ['.', './mcp', './sqlite', './web', './testing', './starter', './cordis.patch.yml']
const dshPackages = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-mcp-client',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-tools',
]

if (pkg.version !== expectedVersion) errors.push(`package version must be ${expectedVersion}`)
if (pkg.publishConfig?.tag !== 'alpha') errors.push('publishConfig.tag must be alpha')
if (DSH_TARGET.version !== expectedDsh || DSH_TARGET.commit !== expectedCommit) {
  errors.push('DSH target identity drifted from 0.1.2-rc.1')
}
if (JSON.stringify(Object.keys(pkg.exports)) !== JSON.stringify(expectedExports)) {
  errors.push(`public exports must be exactly ${expectedExports.join(', ')}`)
}
for (const name of dshPackages) {
  if (pkg.peerDependencies?.[name] !== expectedDsh) errors.push(`${name} peer must be exact ${expectedDsh}`)
  if (pkg.devDependencies?.[name] !== expectedDsh) errors.push(`${name} dev dependency must be exact ${expectedDsh}`)
}
for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
  if (name.startsWith('@deepseek-ai/dsh-') && version !== expectedDsh) {
    errors.push(`${name} dev dependency must be exact ${expectedDsh}`)
  }
}

const lockfile = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')
const resolvedDshPackages = [
  ...lockfile.matchAll(/^  '(@deepseek-ai\/dsh-[^@']+)@([^:(']+)(?:\([^']*)?':/gm),
]
if (resolvedDshPackages.length === 0) errors.push('lockfile contains no resolved DSH packages')
for (const match of resolvedDshPackages) {
  const [, name, version] = match
  if (version !== expectedDsh) errors.push(`${name} lockfile resolution must be exact ${expectedDsh}, got ${version}`)
}

for (const path of [
  'packages/multi-tenant/src/capability.ts',
  'packages/multi-tenant/src/composition.ts',
  'packages/multi-tenant/src/credentials.ts',
  'packages/multi-tenant/src/operation.ts',
  'packages/multi-tenant/src/runtime.ts',
  'packages/multi-tenant/src/runtime-composition.ts',
  'packages/multi-tenant/src/store.ts',
  'packages/multi-tenant/src/sqlite-store.ts',
  'packages/multi-tenant/src/starter.ts',
  'docs/specs/v0.3-assumptions.json',
  'docs/vision/authority-capabilities.md',
  'docs/releases/v0.3.0-rc.3.md',
  'scripts/verify-v03.mjs',
]) {
  if (existsSync(join(root, path))) errors.push(`retired v0.3 artifact remains: ${path}`)
}

for (const path of [
  'packages/multi-tenant/src/repository.ts',
  'packages/multi-tenant/src/runtime-driver.ts',
  'packages/multi-tenant/src/sqlite.ts',
  'packages/multi-tenant/tests/dsh-mcp.integration.test.ts',
  'docs/reference/compatibility.md',
  'docs/reference/compatibility.zh-CN.md',
  'docs/reference/release.md',
  'docs/reference/release.zh-CN.md',
  `docs/releases/v${expectedVersion}.md`,
]) {
  if (!existsSync(join(root, path))) errors.push(`required v0.4 artifact missing: ${path}`)
}

const sourceFiles = [
  'packages/multi-tenant/src/index.ts',
  'packages/multi-tenant/src/service.ts',
  'packages/multi-tenant/src/sqlite.ts',
  'packages/multi-tenant/src/web.ts',
].map(path => [path, readFileSync(join(root, path), 'utf8')])
for (const [path, source] of sourceFiles) {
  for (const retired of ['TenantSessionStore', 'RuntimeComposition', 'CapabilityToken']) {
    if (source.includes(retired)) errors.push(`${path}: contains retired symbol ${retired}`)
  }
}

for (const [path, markers] of Object.entries({
  'packages/multi-tenant/src/service.ts': ['AbortSignal.any([lifecycle, secret.signal])'],
  'packages/multi-tenant/src/provider-results.ts': [
    'normalizeSecretLease',
    'normalizeRuntimePartition',
    'normalizeRuntimeHandle',
  ],
  'packages/multi-tenant/src/sqlite.ts': [
    'tenant_agents_v04_provisioning',
    "SET state = 'failed', revision = revision + 1",
  ],
  'packages/multi-tenant/src/repository.ts': ['assertLegalAgentRecordTransition'],
})) {
  const source = readFileSync(join(root, path), 'utf8')
  for (const marker of markers) {
    if (!source.includes(marker)) errors.push(`${path}: missing alpha.2 invariant ${marker}`)
  }
}

const nativeLifecycle = readFileSync(
  join(root, 'packages/multi-tenant/tests/dsh-mcp.integration.test.ts'),
  'utf8',
)
if (nativeLifecycle.includes('setFactory(')) {
  errors.push('native lifecycle integration must not replace the DSH Agent factory')
}
for (const required of ['AgentLoop', 'JsonlSessionPersistence', 'SessionProjectionRegistry']) {
  if (!nativeLifecycle.includes(required)) errors.push(`native lifecycle integration must use ${required}`)
}

if (errors.length > 0) {
  console.error(`v0.4 verification failed:\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log(`v0.4 verification passed: ${pkg.name}@${pkg.version}, DSH ${DSH_TARGET.version} @ ${DSH_TARGET.commit}`)
