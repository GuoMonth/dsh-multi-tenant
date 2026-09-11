#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { DSH_TARGET } from './dsh-target.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'packages/multi-tenant/package.json'), 'utf8'))
const errors = []
const expectedVersion = pkg.version
const expectedDsh = DSH_TARGET.version
const dshPackages = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-mcp-client',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-tools',
]

if (!/^\d+\.\d+\.\d+$/.test(expectedVersion)) errors.push('package version must be an exact non-prerelease identity')
if (pkg.publishConfig?.tag !== 'latest') errors.push('publishConfig.tag must be latest')
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expectedDsh)
  || !/^[0-9a-f]{40}$/.test(DSH_TARGET.commit)
  || DSH_TARGET.repository !== 'deepseek-ai/deepseek-harness') {
  errors.push('DSH target must identify an exact upstream version and source commit')
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

if (errors.length > 0) {
  console.error(`contract verification failed:\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log(`contract verification passed: ${pkg.name}@${pkg.version}, DSH ${DSH_TARGET.version} @ ${DSH_TARGET.commit}`)
