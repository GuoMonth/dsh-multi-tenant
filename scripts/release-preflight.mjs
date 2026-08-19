#!/usr/bin/env node
/**
 * Release-manifest preflight for the first kernel prerelease.
 *
 * This intentionally checks only release-owned facts. Runtime/API behavior is
 * covered by verify/test/smoke/probe:dsh; this script prevents packaging and
 * publication mistakes such as publishing the experimental Web package or
 * accidentally tagging a prerelease as latest.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')
const expectedKernelName = 'dsh-multi-tenant'
const expectedKernelVersion = '0.1.0-rc.1'
const expectedTag = 'next'
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
  if (pkg.version !== expectedKernelVersion) {
    errors.push(`${expectedKernelName}: version must be ${expectedKernelVersion}, got ${String(pkg.version)}`)
  }
  if (pkg.publishConfig?.access !== 'public') {
    errors.push(`${expectedKernelName}: publishConfig.access must be public`)
  }
  if (pkg.publishConfig?.tag !== expectedTag) {
    errors.push(`${expectedKernelName}: publishConfig.tag must be ${expectedTag}`)
  }
  if (pkg.license !== 'MIT') errors.push(`${expectedKernelName}: license must be MIT`)
  if (!pkg.repository?.url) errors.push(`${expectedKernelName}: repository.url is required`)
  if (!pkg.homepage) errors.push(`${expectedKernelName}: homepage is required`)
  if (!pkg.bugs?.url) errors.push(`${expectedKernelName}: bugs.url is required`)
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') {
    errors.push(`${expectedKernelName}: dsh.bundle.patch must be ./cordis.patch.yml`)
  }
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
if (!web) {
  errors.push('dsh-multi-tenant-web: package not found')
} else if (web.pkg.private !== true) {
  errors.push('dsh-multi-tenant-web: must stay private until its production contract is ready')
}

if (errors.length) {
  console.error('release preflight failed:\n- ' + errors.join('\n- '))
  process.exit(1)
}

console.log(`release preflight passed: ${expectedKernelName}@${expectedKernelVersion} -> dist-tag ${expectedTag}; experimental Web package is private`)
