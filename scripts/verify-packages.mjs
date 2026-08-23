#!/usr/bin/env node
/**
 * Verify workspace package invariants — the executable form of CONTRIBUTING's
 * architecture rules. Run from the repo root: `node scripts/verify-packages.mjs`.
 *
 * Checks:
 *   - every package has build / typecheck / test scripts
 *   - the kernel's runtime dependencies are only the Cordis framework
 *   - publishable packages have consistent entry metadata + `engines.node`
 *   - DSH-facing proof packages stay pinned to the repository's exact baseline
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { DSH_TARGET } from './dsh-target.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')

// The kernel may depend on the Cordis framework at runtime, and nothing else.
const KERNEL_RUNTIME_ALLOWLIST = new Set(['@deepseek-ai/cordis'])

const errors = []

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

  for (const script of ['build', 'typecheck', 'test']) {
    if (!pkg.scripts?.[script]) errors.push(`${label}: missing "${script}" script`)
  }

  if (pkg.name === 'dsh-multi-tenant') {
    const runtime = { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}), ...(pkg.optionalDependencies ?? {}) }
    for (const dep of Object.keys(runtime)) {
      if (!KERNEL_RUNTIME_ALLOWLIST.has(dep)) {
        errors.push(`${label}: runtime dependency "${dep}" is not allowed in the kernel`)
      }
    }
  }

  if (pkg.name === 'dsh-multi-tenant-web') {
    const apiproxy = pkg.devDependencies?.['@deepseek-ai/dsh-host-apiproxy']
    if (apiproxy !== DSH_TARGET.version) {
      errors.push(`${label}: @deepseek-ai/dsh-host-apiproxy must pin ${DSH_TARGET.version}, got ${String(apiproxy)}`)
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
console.log(`package verification passed (${readdirSync(packagesDir).length} packages; DSH ${DSH_TARGET.version} @ ${DSH_TARGET.commit.slice(0, 12)})`)
