#!/usr/bin/env node
/** Post-publication verification for the exact published v0.3 artifact. */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = 'dsh-multi-tenant'
const EXPECTED_REPOSITORY = 'https://github.com/guomonth/dsh-multi-tenant'
const root = fileURLToPath(new URL('..', import.meta.url))
const version = process.argv[2]

if (!version) {
  console.error('usage: node scripts/registry-smoke.mjs <version>')
  process.exit(2)
}

function npmJson(args) {
  const out = execFileSync('npm', [...args, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  return out ? JSON.parse(out) : undefined
}

function normalizeRepository(value) {
  return String(value ?? '')
    .trim()
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase()
}

let registryVersion
for (let attempt = 1; attempt <= 10; attempt++) {
  try {
    registryVersion = npmJson(['view', `${PACKAGE_NAME}@${version}`, 'version'])
    if (registryVersion === version) break
  } catch (error) {
    if (attempt === 10) throw error
  }
  await new Promise(resolve => setTimeout(resolve, 3000))
}
if (registryVersion !== version) throw new Error(`registry did not resolve ${PACKAGE_NAME}@${version}`)

const latestVersion = npmJson(['view', `${PACKAGE_NAME}@latest`, 'version'])
if (latestVersion !== version) {
  throw new Error(`npm latest dist-tag resolves to ${String(latestVersion)}, expected ${version}`)
}

const repository = npmJson(['view', `${PACKAGE_NAME}@${version}`, 'repository.url'])
if (normalizeRepository(repository) !== EXPECTED_REPOSITORY) {
  throw new Error(`registry repository mismatch: ${String(repository)}`)
}

const integrity = npmJson(['view', `${PACKAGE_NAME}@${version}`, 'dist.integrity'])
if (!integrity) throw new Error('registry artifact is missing dist.integrity')

// Reuse the exact same installed-consumer contract that validates a local
// tarball before publication. This keeps pre- and post-publication semantics in
// one place: RuntimeComposition, Product Ingress, Principal Credentials, Tenant
// MCP config, packaged M5 MCP-client resolution, Session ownership and denial.
execFileSync('node', [
  'scripts/artifact-consumer-smoke.mjs',
  `${PACKAGE_NAME}@${version}`,
], {
  cwd: root,
  stdio: ['ignore', 'inherit', 'inherit'],
})

console.log(`registry smoke passed: ${PACKAGE_NAME}@${version}; latest=${version}; integrity=${integrity.slice(0, 20)}…`)
