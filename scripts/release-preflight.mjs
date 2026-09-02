#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'packages/multi-tenant/package.json'), 'utf8'))
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const errors = []
const version = '0.4.0-alpha.1'
const requiredExports = ['.', './mcp', './sqlite', './web', './testing', './starter', './cordis.patch.yml']

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

if (pkg.name !== 'dsh-multi-tenant' || pkg.version !== version) errors.push('release identity mismatch')
if (pkg.publishConfig?.access !== 'public' || pkg.publishConfig?.tag !== 'alpha' || pkg.publishConfig?.provenance !== true) {
  errors.push('publishConfig must be public alpha with provenance')
}
if (pkg.license !== 'MIT') errors.push('license must be MIT')
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') errors.push('DSH bundle patch missing')
if (JSON.stringify(Object.keys(pkg.exports)) !== JSON.stringify(requiredExports)) errors.push('public export surface drifted')
for (const file of ['dist', 'README.md', 'README.zh-CN.md', 'LICENSE', 'cordis.patch.yml']) {
  if (!(pkg.files ?? []).includes(file)) errors.push(`package files missing ${file}`)
}

for (const [path, markers] of Object.entries({
  'README.md': [version, 'logical isolation', 'DSH `/api`'],
  'README.zh-CN.md': [version, '逻辑隔离', 'Stock DSH `/api`'],
  'packages/multi-tenant/README.md': [version, '## Minimal API', '## Real MCP configuration', '## Guarantees and boundaries'],
  'packages/multi-tenant/README.zh-CN.md': [version, '## 最小 API', '## 真实 MCP', '## 保证与边界'],
  'docs/reference/compatibility.md': [version, '0.1.2-alpha.5'],
  'docs/reference/compatibility.zh-CN.md': [version, '0.1.2-alpha.5'],
  'docs/reference/release.md': [version, 'pnpm release:check'],
  'docs/reference/release.zh-CN.md': [version, 'pnpm release:check'],
  [`docs/releases/v${version}.md`]: [version, '## Retrospective', '## Explicit limits'],
})) {
  const absolute = join(root, path)
  if (!existsSync(absolute)) {
    errors.push(`release artifact missing: ${path}`)
    continue
  }
  const content = readFileSync(absolute, 'utf8')
  for (const marker of markers) if (!content.includes(marker)) errors.push(`${path} missing ${marker}`)
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
for (const marker of ['workflow_dispatch:', 'environment: npm-release', 'actions: read', 'id-token: write', 'Require successful CI for release commit', 'pnpm release:check', 'npm publish --access public --provenance --tag alpha']) {
  if (!release.includes(marker)) errors.push(`manual release workflow missing ${marker}`)
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

for (const retired of [
  'DIRECTION.md', 'DIRECTION.zh-CN.md', 'docs/specs/v0.3-assumptions.json',
  'docs/vision/authority-capabilities.md',
  'scripts/session-genesis-probe.mjs', 'scripts/first-product-experience-probe.mjs',
  'scripts/sqlite-session-store-probe.mjs',
]) {
  if (existsSync(join(root, retired))) errors.push(`retired artifact remains: ${retired}`)
}

if (errors.length > 0) {
  console.error(`release preflight failed:\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log(`release preflight passed: dsh-multi-tenant@${version} on alpha`)
