#!/usr/bin/env node
/**
 * Package smoke: prove the packed tarball is a valid distributable for an
 * external consumer. Build → pack → verify contents/exports → install into a
 * clean temp consumer → exercise both the v0.1 kernel and v0.2 runtime.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkgDir = join(root, 'packages', 'multi-tenant')
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))

function collectTargets(exports, acc = []) {
  if (typeof exports === 'string') {
    acc.push(exports)
    return acc
  }
  if (exports && typeof exports === 'object') {
    for (const value of Object.values(exports)) collectTargets(value, acc)
  }
  return acc
}

const tmp = mkdtempSync(join(tmpdir(), 'dsh-mt-pack-'))
const consumer = mkdtempSync(join(tmpdir(), 'dsh-mt-consumer-'))
try {
  execFileSync('pnpm', ['--filter', 'dsh-multi-tenant', 'build'], { cwd: root, stdio: 'ignore' })
  execFileSync('pnpm', ['--filter', 'dsh-multi-tenant', 'pack', '--pack-destination', tmp], {
    cwd: root,
    stdio: 'ignore',
  })
  const tarball = readdirSync(tmp).find(f => f.endsWith('.tgz'))
  if (!tarball) throw new Error('pnpm pack produced no tarball')

  const listing = execFileSync('tar', ['-tzf', join(tmp, tarball)], { encoding: 'utf8' })
  const lines = listing.split('\n')
  const has = f => lines.some(line => line === f || line.endsWith(`/${f}`))

  const required = [
    'package.json',
    'dist/index.mjs',
    'dist/runtime.mjs',
    'dist/store.mjs',
    'dist/testing.mjs',
    'cordis.patch.yml',
    'README.md',
    'LICENSE',
  ]
  const missing = required.filter(f => !has(f))
  if (missing.length) throw new Error(`tarball is missing: ${missing.join(', ')}`)

  const targets = collectTargets(pkg.exports)
  const unresolved = targets.filter(t => !has(t.replace(/^\.\//, '')))
  if (unresolved.length) throw new Error(`exports targets missing from tarball: ${unresolved.join(', ')}`)

  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'smoke-consumer', private: true, type: 'module' }))
  execFileSync('pnpm', ['add', join(tmp, tarball), '@deepseek-ai/cordis@4.0.1'], { cwd: consumer, stdio: 'ignore' })
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
    'const alice = { tenantId: "acme", userId: "alice" };',
    'await ctx.multiTenant.claimSession("s1", alice);',
    'if ((await ctx.multiTenant.canAccessSession(alice, "s1")) !== true) throw new Error("smoke: same-user should be allowed");',
    'const tenant = ctx.tenantRuntime.createTenant("acme", { isolateServices: ["tenantAuth"] });',
    'await tenant.ctx.plugin((c, value) => { c.provide("tenantAuth", value); }, "auth-A");',
    'if (tenant.ctx.get("tenantAuth") !== "auth-A") throw new Error("smoke: tenant capability did not resolve");',
    'if (ctx.get("tenantAuth") !== undefined) throw new Error("smoke: tenant capability leaked to root");',
    'const principal = tenant.createPrincipal(alice);',
    'await principal.ctx.multiTenant.claimSession("s2", principal.principal);',
    'const ownerFromRoot = await ctx.multiTenant.getSessionOwner("s2");',
    'if (ownerFromRoot?.tenantId !== "acme" || ownerFromRoot?.userId !== "alice") throw new Error("smoke: ownership kernel state did not cross context boundary");',
    'await assertTenantSessionStoreContract(async (c) => { await c.plugin(Store); return c.tenantSessionStore });',
    'await tenant.dispose();',
    'console.log("consumer smoke passed");',
  ].join('\n'))
  execFileSync('node', ['smoke.mjs'], { cwd: consumer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

  console.log(`package smoke passed: ${tarball}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
  rmSync(consumer, { recursive: true, force: true })
}
