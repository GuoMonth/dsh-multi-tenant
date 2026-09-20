#!/usr/bin/env node
/** Post-publication verification for the exact artifact and npm dist-tag. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
    timeout: 20000,
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

// npm may accept an upload before publishing its public metadata. Only read here;
// never interpret delayed visibility as permission to publish the same version again.
let registryVersion
let taggedVersion
const deadline = Date.now() + 10 * 60 * 1000
while (Date.now() < deadline) {
  try {
    registryVersion = npmJson(['view', `${PACKAGE_NAME}@${version}`, 'version', '--prefer-online'])
    taggedVersion = npmJson(['view', `${PACKAGE_NAME}@${distTag}`, 'version', '--prefer-online'])
    if (registryVersion === version && taggedVersion === version) break
  } catch { /* bounded metadata propagation wait; no write or credential output */ }
  console.log(`Waiting for public ${PACKAGE_NAME}@${version} and ${distTag}; upload is not replayed`)
  await new Promise(resolve => setTimeout(resolve, 15000))
}
if (registryVersion !== version || taggedVersion !== version) {
  throw new Error('Public version/dist-tag did not converge within 10 minutes; inspect accepted publication before retrying')
}

const repository = npmJson(['view', `${PACKAGE_NAME}@${version}`, 'repository.url'])
if (normalizeRepository(repository) !== EXPECTED_REPOSITORY) {
  throw new Error(`registry repository mismatch: ${String(repository)}`)
}

const integrity = npmJson(['view', `${PACKAGE_NAME}@${version}`, 'dist.integrity'])
if (!integrity) throw new Error('registry artifact is missing dist.integrity')
const packed = readFileSync(join(root, `release-artifact/dsh-multi-tenant-${version}.tgz`))
const expectedIntegrity = 'sha512-' + createHash('sha512').update(packed).digest('base64')
if (integrity !== expectedIntegrity) throw new Error('Registry artifact differs from the verified publication tarball')

// Always inspect the installed Cell artifact. This is not a cluster regression.
execFileSync(process.execPath, ['scripts/cell-artifact-smoke.mjs', `${PACKAGE_NAME}@${version}`], { cwd: root, stdio: 'inherit' })
const installed = installArtifact(`${PACKAGE_NAME}@${version}`)
try {
  const manifest = JSON.parse(readFileSync(join(installed.packageDirectory, 'cell-release.json'), 'utf8'))
  if (manifest.status !== 'release-bound') throw new Error('Published Cell combination is not release-bound')
  for (const name of ['cell', 'operator']) {
    const image = manifest.images[name]
    if (!/^ghcr\.io\/guomonth\/dsh-isolated-runtime-(cell|operator)@sha256:[a-f0-9]{64}$/.test(image ?? '')) throw new Error('Missing runtime-owned immutable image')
  }
} finally { installed.close() }

console.log(`registry smoke passed: ${PACKAGE_NAME}@${version}; ${distTag}=${version}; integrity=${integrity.slice(0, 20)}…`)
