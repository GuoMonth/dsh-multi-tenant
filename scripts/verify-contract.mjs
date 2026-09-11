#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { DSH_TARGET } from './dsh-target.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'packages/multi-tenant/package.json'), 'utf8'))
const native = JSON.parse(readFileSync(join(root, 'scripts/native-host-probe/package.json'), 'utf8'))
const errors = []
if (pkg.dshRuntime?.version !== DSH_TARGET.version || pkg.dshRuntime?.commit !== DSH_TARGET.commit) errors.push('runtime target must match exact DSH version and commit')
if (pkg.dsh || pkg.peerDependencies) errors.push('platform package must not install as a shared-host Cordis plugin')
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) errors.push('package version must be exact')
if (!/^[a-f0-9]{40}$/.test(DSH_TARGET.commit)) errors.push('invalid source identity')
for (const [name, version] of Object.entries(native.dependencies)) {
  if ((name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) && version !== DSH_TARGET.version) errors.push(`${name} runtime dependency must be exact ${DSH_TARGET.version}`)
}
const lock = readFileSync(join(root, 'scripts/native-host-probe/pnpm-lock.yaml'), 'utf8')
const packages = [...lock.matchAll(/^  '(@deepseek-ai\/dsh(?:-[^@']+)?)[@]([^:(']+)(?:\([^']*)?':/gm)]
if (!packages.length) errors.push('native lock contains no DSH packages')
for (const [, name, version] of packages) if (version !== DSH_TARGET.version) errors.push(`${name} native resolution is not exact`)
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log(`contract verification passed: ${pkg.name}@${pkg.version}; native DSH ${DSH_TARGET.version} @ ${DSH_TARGET.commit}`)
