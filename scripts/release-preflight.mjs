#!/usr/bin/env node
/**
 * Release-manifest preflight.
 *
 * package.json is the single source of truth for the release version and npm
 * channel. Runtime/API behavior is covered by verify/test/smoke/probe:dsh;
 * this script prevents packaging, workflow and documentation drift.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')
const expectedPackageName = 'dsh-multi-tenant'
const expectedTag = 'latest'
const expectedRepository = 'git+https://github.com/GuoMonth/dsh-multi-tenant.git'
const errors = []

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
  if (typeof releaseVersion !== 'string' || releaseVersion.length === 0) errors.push(`${expectedPackageName}: version is required`)
  if (pkg.publishConfig?.access !== 'public') errors.push(`${expectedPackageName}: publishConfig.access must be public`)
  if (pkg.publishConfig?.tag !== expectedTag) errors.push(`${expectedPackageName}: publishConfig.tag must be ${expectedTag}`)
  if (pkg.publishConfig?.provenance !== true) errors.push(`${expectedPackageName}: publishConfig.provenance must be true`)
  if (pkg.license !== 'MIT') errors.push(`${expectedPackageName}: license must be MIT`)
  if (pkg.repository?.url !== expectedRepository) errors.push(`${expectedPackageName}: repository.url must be ${expectedRepository}`)
  if (!pkg.homepage) errors.push(`${expectedPackageName}: homepage is required`)
  if (!pkg.bugs?.url) errors.push(`${expectedPackageName}: bugs.url is required`)
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') errors.push(`${expectedPackageName}: dsh.bundle.patch must be ./cordis.patch.yml`)
  if (!pkg.scripts?.prepare) errors.push(`${expectedPackageName}: prepare script is required for source installs`)

  const files = new Set(pkg.files ?? [])
  for (const required of ['dist', 'README.md', 'LICENSE', 'cordis.patch.yml']) {
    if (!files.has(required)) errors.push(`${expectedPackageName}: files must include ${required}`)
  }

  const exports = pkg.exports ?? {}
  for (const required of ['.', './runtime', './store', './testing', './cordis.patch.yml']) {
    if (!(required in exports)) errors.push(`${expectedPackageName}: exports must include ${required}`)
  }

  const readme = readFileSync(join(dir, 'README.md'), 'utf8')
  for (const heading of ['## Runtime model', '## Supported guarantee', '## Canonical publication', '## Explicit boundaries']) {
    if (!readme.includes(heading)) errors.push(`${expectedPackageName}: README missing ${heading}`)
  }
}

const web = packages.find(({ pkg }) => pkg.name === 'dsh-multi-tenant-web')
if (!web) errors.push('dsh-multi-tenant-web: package not found')
else if (web.pkg.private !== true) errors.push('dsh-multi-tenant-web: must stay private until its production contract is ready')

const releaseWorkflowPath = join(root, '.github/workflows/release.yml')
if (!existsSync(releaseWorkflowPath)) {
  errors.push('release artifact missing: .github/workflows/release.yml')
} else {
  const workflow = readFileSync(releaseWorkflowPath, 'utf8')
  if (!workflow.includes('id-token: write')) errors.push('release workflow must grant id-token: write for npm OIDC')
  if (!workflow.includes('environment: npm-release')) errors.push('release workflow must use the npm-release environment')
  if (!workflow.includes('actions/setup-node@v7')) errors.push('release workflow must use actions/setup-node@v7')
  if (workflow.includes('registry-url:')) errors.push('release workflow must not let setup-node generate token auth; npm Trusted Publishing owns registry authentication')
  if (workflow.includes('NPM_BOOTSTRAP_TOKEN')) errors.push('release workflow must be OIDC-only; bootstrap token fallback is not allowed')
  if (workflow.includes('inputs.version')) errors.push('release workflow must derive the version from package.json instead of duplicating version input')
  if (workflow.includes('--tag next')) errors.push('release workflow must publish the package default latest channel, not next')
}

for (const requiredPath of [
  ...(releaseVersion ? [`docs/releases/v${releaseVersion}.md`] : []),
  'docs/releases/v0.2.0-rc.2.md',
  'docs/releases/v0.2.0-rc.1.md',
  'docs/releases/v0.1.0-rc.2.md',
  'scripts/agent-owner-context-probe.mjs',
  'scripts/registry-preflight.mjs',
  'scripts/registry-smoke.mjs',
]) {
  if (!existsSync(join(root, requiredPath))) errors.push(`release artifact missing: ${requiredPath}`)
}

if (errors.length) {
  console.error('release preflight failed:\n- ' + errors.join('\n- '))
  process.exit(1)
}

console.log(`release preflight passed: ${expectedPackageName}@${releaseVersion} -> ${expectedTag}; canonical v0.2 runtime; OIDC-only publishing`)
