#!/usr/bin/env node
/** Post-publication registry smoke for the exact published runtime version. */
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

const consumer = mkdtempSync(join(tmpdir(), 'dsh-mt-registry-consumer-'))
try {
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'registry-smoke-consumer', private: true, type: 'module' }))
  execFileSync('pnpm', ['add', `${PACKAGE_NAME}@${version}`, '@deepseek-ai/cordis@4.0.1'], {
    cwd: consumer,
    stdio: 'ignore',
  })

  writeFileSync(join(consumer, 'smoke.mjs'), [
    'import { Context } from "@deepseek-ai/cordis";',
    'import Store from "dsh-multi-tenant/store";',
    'import Service from "dsh-multi-tenant";',
    'import Runtime from "dsh-multi-tenant/runtime";',
    'import { assertTenantSessionStoreContract } from "dsh-multi-tenant/testing";',
    'const ctx = new Context();',
    'await ctx.plugin(Store);',
    'await ctx.plugin(Service);',
    'await ctx.plugin(Runtime);',
    'const tenant = await ctx.tenantRuntime.tenants.ensure("acme", { isolateServices: ["tenantAuth"] });',
    'await tenant.ctx.plugin((child) => { child.provide("tenantAuth", "auth-A"); });',
    'const alice = await tenant.principals.ensure("alice");',
    'if (tenant.ctx.get("tenantAuth") !== "auth-A") throw new Error("registry smoke: tenant capability missing");',
    'if (alice.ctx.get("tenantAuth") !== "auth-A") throw new Error("registry smoke: principal did not inherit tenant capability");',
    'await alice.ctx.multiTenant.claimSession("registry-s1", alice.identity);',
    'if ((await alice.ctx.multiTenant.canAccessSession(alice.identity, "registry-s1")) !== true) throw new Error("registry smoke: owner access denied");',
    'await assertTenantSessionStoreContract(async (c) => { await c.plugin(Store); return c.tenantSessionStore });',
    'await tenant.dispose();',
    'console.log("registry runtime smoke passed");',
  ].join('\n'))

  execFileSync('node', ['smoke.mjs'], {
    cwd: consumer,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} finally {
  rmSync(consumer, { recursive: true, force: true })
}

console.log(`registry smoke passed: ${PACKAGE_NAME}@${version}; latest=${version}; integrity=${integrity.slice(0, 20)}…`)
