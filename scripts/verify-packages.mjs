#!/usr/bin/env node
/**
 * Verify current workspace package invariants.
 *
 * This script protects rules owned by the present package graph. It does not
 * encode speculative future package roles; new v0.3 packages should introduce
 * their own contracts only when those roles actually exist.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')
const KERNEL_RUNTIME_ALLOWLIST = new Set(['@deepseek-ai/cordis'])
const errors = []
const packageNames = []

for (const name of readdirSync(packagesDir)) {
  const dir = join(packagesDir, name)
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    errors.push(`packages/${name}: missing or invalid package.json`)
    continue
  }

  const label = pkg.name ?? `packages/${name}`
  packageNames.push(label)

  for (const script of ['build', 'typecheck', 'test']) {
    if (!pkg.scripts?.[script]) errors.push(`${label}: missing "${script}" script`)
  }

  if (pkg.name === 'dsh-multi-tenant') {
    const runtime = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
      ...(pkg.optionalDependencies ?? {}),
    }
    for (const dep of Object.keys(runtime)) {
      if (!KERNEL_RUNTIME_ALLOWLIST.has(dep)) {
        errors.push(`${label}: runtime dependency "${dep}" is not allowed in the Runtime Contract`)
      }
    }
  }

  if (pkg.private !== true) {
    if (pkg.main !== 'dist/index.mjs') errors.push(`${label}: "main" must be "dist/index.mjs"`)
    if (pkg.types !== 'dist/index.d.mts') errors.push(`${label}: "types" must be "dist/index.d.mts"`)
    if (!pkg.engines?.node) errors.push(`${label}: missing "engines.node"`)
  }
}

if (errors.length) {
  console.error('package verification failed:\n- ' + errors.join('\n- '))
  process.exit(1)
}

console.log(`package verification passed (${packageNames.join(', ') || 'no packages'})`)
