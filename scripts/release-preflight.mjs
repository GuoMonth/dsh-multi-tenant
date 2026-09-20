#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { DSH_TARGET } from './dsh-target.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'packages/multi-tenant/package.json'), 'utf8'))
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const errors = []
const version = pkg.version
const combination = JSON.parse(readFileSync(join(root, 'packages/multi-tenant/cell-release.json'), 'utf8'))
if (combination.platformVersion !== version || combination.channel !== 'latest' || combination.runtime.accessMode !== 'platform' || combination.dsh.commit !== DSH_TARGET.commit) errors.push('Cell release combination mismatch')

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

if (pkg.name !== 'dsh-multi-tenant' || !/^\d+\.\d+\.\d+(?:-alpha\.\d+)?$/.test(version)) errors.push('release identity mismatch')
if (pkg.publishConfig?.access !== 'public' || pkg.publishConfig?.tag !== 'latest' || pkg.publishConfig?.provenance !== true) {
  errors.push('publishConfig must be public latest with provenance')
}
if (pkg.license !== 'MIT') errors.push('license must be MIT')
if (pkg.dsh) errors.push('obsolete Cordis bundle metadata')
for (const file of ['dist', 'README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'AI.md', 'cell-release.json', 'THIRD_PARTY_NOTICES', 'runtime', 'LICENSE', 'src/native/runtime-control.mjs', 'examples']) {
  if (!(pkg.files ?? []).includes(file)) errors.push(`package files missing ${file}`)
}

for (const path of ['README.md', 'README.zh-CN.md', 'packages/multi-tenant/README.md', 'packages/multi-tenant/README.zh-CN.md', `docs/releases/v${version}.md`]) {
  if (!existsSync(join(root, path))) errors.push(`documentation missing: ${path}`)
}

const releaseCheck = String(rootPkg.scripts?.['release:check'] ?? '')
for (const marker of ['pnpm verify', 'pnpm peers:check', 'pnpm typecheck', 'pnpm test', 'pnpm build', 'pnpm probe:sqlite', 'pnpm smoke', 'pnpm smoke:cell']) {
  if (!releaseCheck.includes(marker)) errors.push(`release:check missing ${marker}`)
}

const release = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')
for (const marker of ['workflow_dispatch:', 'environment: npm-release', 'id-token: write', 'npm publish --access public --provenance --tag "$NPM_TAG"']) {
  if (!release.includes(marker)) errors.push(`manual release workflow missing ${marker}`)
}

const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
if (!workspace.includes('minimumReleaseAge: 1440')) errors.push('platform supply-chain age policy missing')
const nativePolicy = readFileSync(join(root, 'scripts/native-host-probe/pnpm-workspace.yaml'), 'utf8')
if (!nativePolicy.includes(`'@deepseek-ai/dsh@${DSH_TARGET.version}'`)) errors.push('native exact baseline policy missing')


for (const workflow of filesBelow(join(root, '.github/workflows'))
  .filter(path => path.endsWith('.yml') || path.endsWith('.yaml'))) {
  const content = readFileSync(workflow, 'utf8')
  const references = content.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)
  for (const match of references) {
    const reference = match[1]?.replace(/^['"]|['"]$/g, '') ?? ''
    if (reference.startsWith('./')) continue
    const separator = reference.lastIndexOf('@')
    const revision = separator < 0 ? '' : reference.slice(separator + 1)
    if (!/^[0-9a-f]{40}$/i.test(revision)) {
      errors.push(`${workflow.slice(root.length + 1)} has mutable or unpinned uses: ${reference}`)
    }
  }
}

if (errors.length > 0) {
  console.error(`release preflight failed:\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log(`release preflight passed: dsh-multi-tenant@${version} on latest`)
