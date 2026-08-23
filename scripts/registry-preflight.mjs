#!/usr/bin/env node
/**
 * Read-only npm registry preflight immediately before publication.
 *
 * The npm package already exists and is owned by this repository. The only
 * valid release states are therefore:
 *
 *   existing package + absent exact version  -> publish
 *   existing package + existing exact version -> verify/recover
 *
 * Missing package identity or repository mismatch is a hard failure rather
 * than an obsolete bootstrap branch in the release state machine.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const PACKAGE_NAME = 'dsh-multi-tenant'
const EXPECTED_REPOSITORY = 'https://github.com/guomonth/dsh-multi-tenant'
const version = process.argv[2]

if (!version) {
  console.error('usage: node scripts/registry-preflight.mjs <version>')
  process.exit(2)
}

function normalizeRepository(value) {
  return String(value ?? '')
    .trim()
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase()
}

function npmView(spec, field) {
  try {
    const out = execFileSync('npm', ['view', spec, field, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    return { found: true, value: out ? JSON.parse(out) : undefined }
  } catch (error) {
    const text = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
    if (/E404|404 Not Found/i.test(text)) return { found: false }
    throw error
  }
}

const packageRepo = npmView(PACKAGE_NAME, 'repository.url')
if (!packageRepo.found) {
  console.error(`${PACKAGE_NAME} is expected to exist in npm; refusing an implicit first-publication/bootstrap path`)
  process.exit(1)
}

const actualRepo = normalizeRepository(packageRepo.value)
if (actualRepo !== EXPECTED_REPOSITORY) {
  console.error(
    `${PACKAGE_NAME} points at repository ${String(packageRepo.value)}; expected ${EXPECTED_REPOSITORY}. Refusing to publish.`,
  )
  process.exit(1)
}

const exact = npmView(`${PACKAGE_NAME}@${version}`, 'version')
if (exact.found && exact.value !== version) {
  console.error(`registry returned unexpected version ${String(exact.value)} for requested ${version}`)
  process.exit(1)
}

const publishNeeded = !exact.found
console.log(`${PACKAGE_NAME} repository identity verified`)
console.log(
  publishNeeded
    ? `${PACKAGE_NAME}@${version} is absent; publication is required`
    : `${PACKAGE_NAME}@${version} already exists; publication will be skipped and verification may continue`,
)

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `publish_needed=${publishNeeded}\n`)
}
