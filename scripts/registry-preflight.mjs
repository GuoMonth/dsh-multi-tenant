#!/usr/bin/env node
/**
 * Read-only npm registry preflight used immediately before publication.
 *
 * It prevents publishing into an already-owned package name and makes release
 * workflow reruns idempotent when the exact version is already present.
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
if (packageRepo.found) {
  const actualRepo = normalizeRepository(packageRepo.value)
  if (actualRepo !== EXPECTED_REPOSITORY) {
    console.error(
      `${PACKAGE_NAME} already exists in npm with repository ${String(packageRepo.value)}; ` +
        `expected ${EXPECTED_REPOSITORY}. Refusing to publish.`,
    )
    process.exit(1)
  }
  console.log(`${PACKAGE_NAME} already exists and points at the expected repository`)
} else {
  console.log(`${PACKAGE_NAME} does not yet exist in npm; first-publication bootstrap is required`)
}

const exact = npmView(`${PACKAGE_NAME}@${version}`, 'version')
const publishNeeded = !exact.found

if (exact.found && exact.value !== version) {
  console.error(`registry returned unexpected version ${String(exact.value)} for requested ${version}`)
  process.exit(1)
}

console.log(
  publishNeeded
    ? `${PACKAGE_NAME}@${version} is not present; publication is required`
    : `${PACKAGE_NAME}@${version} already exists; publication step will be skipped`,
)

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `publish_needed=${publishNeeded}\n`)
}
