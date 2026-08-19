#!/usr/bin/env node
/**
 * Post-publication registry smoke.
 *
 * Verifies the exact version and `next` dist-tag from npm, installs the registry
 * artifact into a clean consumer, imports every public kernel subpath used by
 * consumers, and exercises claim/access plus the shared store contract.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PACKAGE_NAME = 'dsh-multi-tenant'
const EXPECTED_REPOSITORY = 'https://github.com/guomonth/dsh-multi-tenant'
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
  await new Promise((resolve) => setTimeout(resolve, 3000))
}

if (registryVersion !== version) {
  throw new Error(`registry did not resolve ${PACKAGE_NAME}@${version}`)
}

const nextVersion = npmJson(['view', `${PACKAGE_NAME}@next`, 'version'])
if (nextVersion !== version) {
  throw new Error(`npm next dist-tag resolves to ${String(nextVersion)}, expected ${version}`)
}

const repository = npmJson(['view', `${PACKAGE_NAME}@${version}`, 'repository.url'])
if (normalizeRepository(repository) !== EXPECTED_REPOSITORY) {
  throw new Error(`registry repository mismatch: ${String(repository)}`)
}

const integrity = npmJson(['view', `${PACKAGE_NAME}@${version}`, 'dist.integrity'])
if (!integrity) throw new Error('registry artifact is missing dist.integrity')

const consumer = mkdtempSync(join(tmpdir(), 'dsh-mt-registry-consumer-'))
try {
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'registry-smoke-consumer', private: true, type: 'module' }),
  )

  execFileSync(
    'pnpm',
    ['add', `${PACKAGE_NAME}@${version}`, '@deepseek-ai/cordis@4.0.1'],
    { cwd: consumer, stdio: 'ignore' },
  )

  writeFileSync(
    join(consumer, 'smoke.mjs'),
    [
      'import { Context } from "@deepseek-ai/cordis";',
      'import Store from "dsh-multi-tenant/store";',
      'import Service from "dsh-multi-tenant";',
      'import { assertTenantSessionStoreContract } from "dsh-multi-tenant/testing";',
      'const ctx = new Context();',
      'await ctx.plugin(Store);',
      'await ctx.plugin(Service);',
      'const alice = { tenantId: "acme", userId: "alice", roles: ["member"] };',
      'await ctx.multiTenant.claimSession("registry-s1", alice);',
      'if ((await ctx.multiTenant.canAccessSession(alice, "registry-s1")) !== true) throw new Error("registry smoke: owner access denied");',
      'await assertTenantSessionStoreContract(async (c) => { await c.plugin(Store); return c.tenantSessionStore });',
      'console.log("registry consumer smoke passed");',
    ].join('\n'),
  )

  execFileSync('node', ['smoke.mjs'], {
    cwd: consumer,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} finally {
  rmSync(consumer, { recursive: true, force: true })
}

console.log(
  `registry smoke passed: ${PACKAGE_NAME}@${version}; next=${version}; integrity=${integrity.slice(0, 20)}…`,
)
