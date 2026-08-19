#!/usr/bin/env node
/**
 * Release-manifest preflight for the current kernel prerelease.
 * Runtime/API behavior is covered by verify/test/smoke/probe:dsh; this script
 * prevents packaging/publication drift.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')
const expectedKernelName = 'dsh-multi-tenant'
const expectedKernelVersion = '0.1.0-rc.2'
const expectedTag = 'next'
const expectedRepository = 'git+https://github.com/GuoMonth/dsh-multi-tenant.git'
const errors = []

const packages = readdirSync(packagesDir).map((dirName) => {
  const dir = join(packagesDir, dirName)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  return { dirName, dir, pkg }
})

const publishable = packages.filter(({ pkg }) => pkg.private !== true)
if (publishable.length !== 1 || publishable[0]?.pkg.name !== expectedKernelName) {
  errors.push(`exactly one workspace package must be publishable (${expectedKernelName}); got ${publishable.map(({ pkg }) => pkg.name).join(', ') || 'none'}`)
}

const kernel = packages.find(({ pkg }) => pkg.name === expectedKernelName)
if (!kernel) {
  errors.push(`${expectedKernelName}: package not found`)
} else {
  const { pkg, dir } = kernel
  if (pkg.version !== expectedKernelVersion) errors.push(`${expectedKernelName}: version must be ${expectedKernelVersion}, got ${String(pkg.version)}`)
  if (pkg.publishConfig?.access !== 'public') errors.push(`${expectedKernelName}: publishConfig.access must be public`)
  if (pkg.publishConfig?.tag !== expectedTag) errors.push(`${expectedKernelName}: publishConfig.tag must be ${expectedTag}`)
  if (pkg.publishConfig?.provenance !== true) errors.push(`${expectedKernelName}: publishConfig.provenance must be true`)
  if (pkg.license !== 'MIT') errors.push(`${expectedKernelName}: license must be MIT`)
  if (pkg.repository?.url !== expectedRepository) errors.push(`${expectedKernelName}: repository.url must be ${expectedRepository}`)
  if (!pkg.homepage) errors.push(`${expectedKernelName}: homepage is required`)
  if (!pkg.bugs?.url) errors.push(`${expectedKernelName}: bugs.url is required`)
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') errors.push(`${expectedKernelName}: dsh.bundle.patch must be ./cordis.patch.yml`)
  if (!pkg.scripts?.prepare) errors.push(`${expectedKernelName}: prepare script is required for source installs`)

  const files = new Set(pkg.files ?? [])
  for (const required of ['dist', 'README.md', 'LICENSE', 'cordis.patch.yml']) {
    if (!files.has(required)) errors.push(`${expectedKernelName}: files must include ${required}`)
  }

  const exports = pkg.exports ?? {}
  for (const required of ['.', './store', './testing', './cordis.patch.yml']) {
    if (!(required in exports)) errors.push(`${expectedKernelName}: exports must include ${required}`)
  }

  const readme = readFileSync(join(dir, 'README.md'), 'utf8')
  for (const heading of ['## Supported guarantee', '## Explicit boundaries']) {
    if (!readme.includes(heading)) errors.push(`${expectedKernelName}: README missing ${heading}`)
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
  if (workflow.includes('NPM_BOOTSTRAP_TOKEN')) errors.push('release workflow must be OIDC-only; bootstrap token fallback is not allowed')
}

for (const requiredPath of [
  'docs/releases/v0.1.0-rc.2.md',
  'scripts/registry-preflight.mjs',
  'scripts/registry-smoke.mjs',
]) {
  if (!existsSync(join(root, requiredPath))) errors.push(`release artifact missing: ${requiredPath}`)
}

if (errors.length) {
  console.error('release preflight failed:\n- ' + errors.join('\n- '))
  process.exit(1)
}

console.log(`release preflight passed: ${expectedKernelName}@${expectedKernelVersion} -> ${expectedTag}; OIDC-only publishing; experimental Web package is private`)
