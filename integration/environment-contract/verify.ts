import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = new URL('../../', import.meta.url)
const require = createRequire(new URL('packages/multi-tenant/package.json', root))
execFileSync(process.execPath, [
  require.resolve('typescript/bin/tsc'), '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--allowImportingTsExtensions',
  '--types', 'node', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2024',
  fileURLToPath(new URL('consumer.ts', import.meta.url)),
], { stdio: 'inherit' })

const core = fileURLToPath(new URL('packages/multi-tenant/src/', root))
const backendDependency = /@dsh\/environment-connector-internal|kubernetes-(?:options|reference)|vendor\/environment-connector/
const walk = (directory: string) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (path.endsWith('.ts')) assert.doesNotMatch(readFileSync(path, 'utf8'), backendDependency, path)
  }
}
walk(core)
console.log('Standalone platform contract and backend-independent imports verified')
