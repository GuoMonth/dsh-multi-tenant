#!/usr/bin/env node
/** Post-publication verification for the exact artifact and npm dist-tag. */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { installArtifact } from './installed-package.mjs'

const PACKAGE_NAME = 'dsh-multi-tenant'
const EXPECTED_REPOSITORY = 'https://github.com/guomonth/dsh-multi-tenant'
const root = fileURLToPath(new URL('..', import.meta.url))
const version = process.argv[2]
const distTag = process.argv[3]
const artifactOnly = process.argv[4] === '--artifact-only'
if (process.argv[4] && !artifactOnly) throw new Error('Unknown registry verification option')

if (!version || !distTag) {
  console.error('usage: node scripts/registry-smoke.mjs <version> <dist-tag>')
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

const taggedVersion = npmJson(['view', `${PACKAGE_NAME}@${distTag}`, 'version'])
if (taggedVersion !== version) {
  throw new Error(`npm ${distTag} dist-tag resolves to ${String(taggedVersion)}, expected ${version}`)
}

const repository = npmJson(['view', `${PACKAGE_NAME}@${version}`, 'repository.url'])
if (normalizeRepository(repository) !== EXPECTED_REPOSITORY) {
  throw new Error(`registry repository mismatch: ${String(repository)}`)
}

const integrity = npmJson(['view', `${PACKAGE_NAME}@${version}`, 'dist.integrity'])
if (!integrity) throw new Error('registry artifact is missing dist.integrity')

if (artifactOnly) {
  // Delivery verification only: no Docker workloads, browser or test suite.
  const installed = installArtifact(`${PACKAGE_NAME}@${version}`)
  try {
    const manifest = JSON.parse(readFileSync(join(installed.packageDirectory, 'runtime-manifest.json'), 'utf8'))
    if (!/^ghcr\.io\/[^\s]+@sha256:[a-f0-9]{64}$/.test(manifest.image ?? '')) throw new Error('Published CLI is missing its runtime digest')
    readFileSync(join(installed.packageDirectory, 'AI.md'), 'utf8')
    execFileSync('npm', ['exec', '--offline', '--', 'dsh-multi-tenant', '--help'], { cwd: installed.directory, stdio: 'inherit' })
    execFileSync('docker', ['buildx', 'imagetools', 'inspect', manifest.image], { stdio: 'inherit' })
  } finally { installed.close() }
} else {
// Reuse the exact same installed-consumer contract that validates a local
// tarball before publication, including the Principal-isolated domain contract.
execFileSync('node', [
  'scripts/artifact-consumer-smoke.mjs',
  `${PACKAGE_NAME}@${version}`,
], {
  cwd: root,
  stdio: ['ignore', 'inherit', 'inherit'],
})

}

console.log(`registry smoke passed: ${PACKAGE_NAME}@${version}; ${distTag}=${version}; integrity=${integrity.slice(0, 20)}…`)
