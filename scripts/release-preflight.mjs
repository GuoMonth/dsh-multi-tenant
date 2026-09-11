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
const releaseTag = `v${version}`

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

if (pkg.name !== 'dsh-multi-tenant' || !/^\d+\.\d+\.\d+$/.test(version)) errors.push('release identity mismatch')
if (pkg.publishConfig?.access !== 'public' || pkg.publishConfig?.tag !== 'latest' || pkg.publishConfig?.provenance !== true) {
  errors.push('publishConfig must be public latest with provenance')
}
if (pkg.license !== 'MIT') errors.push('license must be MIT')
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') errors.push('DSH bundle patch missing')
for (const file of ['dist', 'README.md', 'README.zh-CN.md', 'LICENSE', 'cordis.patch.yml']) {
  if (!(pkg.files ?? []).includes(file)) errors.push(`package files missing ${file}`)
}

for (const path of ['README.md', 'README.zh-CN.md', 'packages/multi-tenant/README.md', 'packages/multi-tenant/README.zh-CN.md', `docs/releases/v${version}.md`]) {
  if (!existsSync(join(root, path))) errors.push(`documentation missing: ${path}`)
}

const releaseCheck = String(rootPkg.scripts?.['release:check'] ?? '')
for (const marker of ['pnpm verify', 'pnpm peers:check', 'pnpm typecheck', 'pnpm test', 'pnpm build', 'pnpm probe:sqlite', 'pnpm smoke']) {
  if (!releaseCheck.includes(marker)) errors.push(`release:check missing ${marker}`)
}

const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
for (const marker of ["'22.19.0'", "'24'", 'pnpm install --frozen-lockfile', 'pnpm release:check']) {
  if (!ci.includes(marker)) errors.push(`CI missing ${marker}`)
}
const release = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')
for (const marker of ['workflow_dispatch:', 'environment: npm-release', 'actions: read', 'id-token: write', 'Require successful CI for release commit', 'pnpm release:check', 'npm publish --access public --provenance --tag "$NPM_TAG"']) {
  if (!release.includes(marker)) errors.push(`manual release workflow missing ${marker}`)
}

const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
for (const marker of [
  'minimumReleaseAge: 1440',
  `'@deepseek-ai/dsh-agent': ${DSH_TARGET.version}`,
  `'@deepseek-ai/dsh-agent@${DSH_TARGET.version}'`,
]) {
  if (!workspace.includes(marker)) errors.push(`pnpm exact baseline policy missing ${marker}`)
}

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
