#!/usr/bin/env node
/** Release-manifest/documentation preflight for the live v0.3 baseline. */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')
const expectedPackageName = 'dsh-multi-tenant'
const expectedTag = 'latest'
const expectedRepository = 'git+https://github.com/GuoMonth/dsh-multi-tenant.git'
const errors = []

function workflowActionRefs(source) {
  const refs = []
  for (const line of source.split('\n')) {
    const match = line.match(/^\s*-\s+uses:\s*([^\s#]+)\s*(?:#.*)?$/)
    if (match) refs.push(match[1])
  }
  return refs
}

function requireMarker(path, marker, label = path) {
  const absolute = join(root, path)
  if (!existsSync(absolute)) {
    errors.push(`release artifact missing: ${path}`)
    return
  }
  if (!readFileSync(absolute, 'utf8').includes(marker)) {
    errors.push(`${label} missing release marker ${JSON.stringify(marker)}`)
  }
}

const packages = readdirSync(packagesDir).map((dirName) => {
  const dir = join(packagesDir, dirName)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  return { dirName, dir, pkg }
})
const publishable = packages.filter(({ pkg }) => pkg.private !== true)
if (publishable.length !== 1 || publishable[0]?.pkg.name !== expectedPackageName) {
  errors.push(`exactly one workspace package must be publishable (${expectedPackageName}); got ${publishable.map(({ pkg }) => pkg.name).join(', ') || 'none'}`)
}

const runtime = packages.find(({ pkg }) => pkg.name === expectedPackageName)
let releaseVersion
if (!runtime) {
  errors.push(`${expectedPackageName}: package not found`)
} else {
  const { pkg, dir } = runtime
  releaseVersion = pkg.version
  if (typeof releaseVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(releaseVersion)) {
    errors.push(`${expectedPackageName}: valid version is required`)
  }
  if (pkg.publishConfig?.access !== 'public') errors.push(`${expectedPackageName}: publishConfig.access must be public`)
  if (pkg.publishConfig?.tag !== expectedTag) errors.push(`${expectedPackageName}: publishConfig.tag must be ${expectedTag}`)
  if (pkg.publishConfig?.provenance !== true) errors.push(`${expectedPackageName}: publishConfig.provenance must be true`)
  if (pkg.license !== 'MIT') errors.push(`${expectedPackageName}: license must be MIT`)
  if (pkg.repository?.url !== expectedRepository) errors.push(`${expectedPackageName}: repository.url must be ${expectedRepository}`)
  if (!pkg.homepage || !pkg.bugs?.url) errors.push(`${expectedPackageName}: homepage and bugs.url are required`)
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') errors.push(`${expectedPackageName}: dsh.bundle.patch must be ./cordis.patch.yml`)
  if (!pkg.scripts?.prepare) errors.push(`${expectedPackageName}: prepare script is required for source installs`)

  const files = new Set(pkg.files ?? [])
  for (const required of ['dist', 'README.md', 'LICENSE', 'cordis.patch.yml']) {
    if (!files.has(required)) errors.push(`${expectedPackageName}: files must include ${required}`)
  }

  const exports = pkg.exports ?? {}
  for (const required of [
    '.', './runtime', './operation', './composition', './runtime-composition',
    './ingress', './credentials', './mcp', './product', './web', './diagnostics',
    './starter', './store', './sqlite-store', './testing', './cordis.patch.yml',
  ]) {
    if (!(required in exports)) errors.push(`${expectedPackageName}: exports must include ${required}`)
  }

  const readme = readFileSync(join(dir, 'README.md'), 'utf8')
  for (const marker of [
    '## The problem',
    '## Install',
    '## Quick start',
    '## What 0.3 provides',
    'First Product Experience',
    'createMcpSaaSRuntime',
    'RuntimeComposition',
    'Principal-scoped replaceable credentials',
    'Tenant-scoped MCP configuration',
    'SQLite',
    '## Architecture',
    '## Security boundary',
  ]) {
    if (!readme.includes(marker)) errors.push(`${expectedPackageName}: README missing ${marker}`)
  }
}

const releaseWorkflowPath = join(root, '.github/workflows/release.yml')
if (!existsSync(releaseWorkflowPath)) {
  errors.push('release artifact missing: .github/workflows/release.yml')
} else {
  const workflow = readFileSync(releaseWorkflowPath, 'utf8')
  const actionRefs = new Set(workflowActionRefs(workflow))
  if (!workflow.includes('id-token: write')) errors.push('release workflow must grant id-token: write for npm OIDC')
  if (!workflow.includes('environment: npm-release')) errors.push('release workflow must use the npm-release environment')
  if (!actionRefs.has('actions/checkout@v7')) errors.push('release workflow must use actions/checkout@v7')
  if (!actionRefs.has('actions/setup-node@v7')) errors.push('release workflow must use actions/setup-node@v7')
  if (!actionRefs.has('pnpm/setup@v2')) errors.push('release workflow must use pnpm/setup@v2')
  if ([...actionRefs].some(ref => ref.startsWith('pnpm/action-setup@'))) errors.push('release workflow must not use legacy pnpm/action-setup')
  if (workflow.includes('registry-url:')) errors.push('release workflow must not let setup-node generate token auth')
  if (workflow.includes('NPM_BOOTSTRAP_TOKEN')) errors.push('release workflow must remain OIDC-only')
  if (workflow.includes('inputs.version')) errors.push('release workflow must derive version from package.json')
  if (workflow.includes('--tag next')) errors.push('release workflow must publish the package default latest channel')
  if (!workflow.includes('pnpm release:check')) errors.push('release workflow must run full release:check')
  if (!workflow.includes('scripts/registry-smoke.mjs')) errors.push('release workflow must verify exact registry artifact')
}

const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (rootPackage.scripts?.smoke !== 'node scripts/artifact-consumer-smoke.mjs --local') {
  errors.push('root smoke must be the consolidated installed-artifact proof')
}
if (String(rootPackage.scripts?.['probe:platform'] ?? '').includes('saas-core')) {
  errors.push('probe:platform must not retain the retired saas-core milestone probe')
}
if (!String(rootPackage.scripts?.['release:check'] ?? '').includes('probe:fpe')) {
  errors.push('release:check must gate publication on the First Product Experience proof')
}
if (!String(rootPackage.scripts?.['release:check'] ?? '').includes('probe:sqlite')) {
  errors.push('release:check must gate publication on the durable local SQLite proof')
}

const registrySmoke = readFileSync(join(root, 'scripts/registry-smoke.mjs'), 'utf8')
if (!registrySmoke.includes('artifact-consumer-smoke.mjs')) {
  errors.push('registry smoke must reuse the installed-artifact v0.3 consumer proof')
}

for (const requiredPath of [
  'DIRECTION.md',
  'DIRECTION.zh-CN.md',
  ...(releaseVersion ? [`docs/releases/v${releaseVersion}.md`] : []),
  'docs/specs/v0.3-assumptions.json',
  'docs/specs/architecture.md',
  'docs/specs/saas-composition.md',
  'docs/specs/saas-boundaries.md',
  'docs/specs/runtime-composition.md',
  'docs/specs/product-ingress-credentials.md',
  'docs/specs/mcp-agent-integration.md',
  'scripts/session-genesis-probe.mjs',
  'scripts/agent-owner-context-probe.mjs',
  'scripts/cordis-operation-lifecycle-probe.mjs',
  'scripts/mcp-agent-integration-probe.mjs',
  'scripts/first-product-experience-probe.mjs',
  'scripts/sqlite-session-store-probe.mjs',
  'scripts/fixtures/mcp-identity-server.mjs',
  'scripts/artifact-consumer-smoke.mjs',
  'scripts/registry-preflight.mjs',
  'scripts/registry-smoke.mjs',
]) {
  if (!existsSync(join(root, requiredPath))) errors.push(`release artifact missing: ${requiredPath}`)
}

for (const retiredPath of [
  'ROADMAP.md',
  'ROADMAP.zh-CN.md',
  'docs/scopes/v0.3.0-rc.2.md',
  'docs/scopes/v0.3.0-rc.2.zh-CN.md',
  'docs/specs/v0.3-foundation.md',
  'docs/specs/m4-product-ingress-credentials.md',
  'docs/specs/m5-mcp-agent-integration.md',
  'scripts/saas-core-vertical-slice-probe.mjs',
  'scripts/m5-mcp-agent-integration-probe.mjs',
  'scripts/package-smoke.mjs',
  '.github/workflows/release-candidate-audit.yml',
]) {
  if (existsSync(join(root, retiredPath))) errors.push(`retired artifact must not return: ${retiredPath}`)
}

if (releaseVersion) {
  requireMarker('README.md', `dsh-multi-tenant@${releaseVersion}`, 'root README')
  requireMarker('README.zh-CN.md', `dsh-multi-tenant@${releaseVersion}`, 'root Chinese README')
  requireMarker('packages/multi-tenant/README.md', `dsh-multi-tenant@${releaseVersion}`, 'package README')
  requireMarker('packages/multi-tenant/README.zh-CN.md', `dsh-multi-tenant@${releaseVersion}`, 'package Chinese README')
  requireMarker('docs/reference/release.md', releaseVersion, 'release reference')
  requireMarker('docs/reference/release.zh-CN.md', releaseVersion, 'Chinese release reference')
  requireMarker(`docs/releases/v${releaseVersion}.md`, releaseVersion, 'release note')
}

if (errors.length) {
  console.error('release preflight failed:\n- ' + errors.join('\n- '))
  process.exit(1)
}

console.log(`release preflight passed: ${expectedPackageName}@${releaseVersion}; FPE + durable local SQLite + installed-artifact proof + OIDC publishing`)
