#!/usr/bin/env node
/**
 * Package smoke: prove the packed tarball is the same contract we test in the
 * repository. Build -> pack -> verify contents/exports -> install into a clean
 * consumer -> exercise the frozen kernel, canonical Runtime, and v0.3
 * Composition -> Principal Operation path through public package subpaths.
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
    'dist/operation.mjs',
    'dist/composition.mjs',
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
    'import { OperationDependencyUnavailableError } from "dsh-multi-tenant/operation";',
    'import {',
    '  bootstrapDeploymentComposition,',
    '  compileSaaSDefinition,',
    '  operationDefinitionFromPlan,',
    '  principalDefinitionFromPlan,',
    '  tenantDefinitionFromPlan,',
    '} from "dsh-multi-tenant/composition";',
    'import { assertTenantSessionStoreContract, assertRuntimeCapabilityProviderContract } from "dsh-multi-tenant/testing";',
    'const ctx = new Context();',
    'await ctx.plugin(Store);',
    'await ctx.plugin(Service);',
    'await ctx.plugin(Runtime);',
    'const alice = { tenantId: "acme", userId: "alice" };',
    'await ctx.multiTenant.claimSession("s1", alice);',
    'if ((await ctx.multiTenant.canAccessSession(alice, "s1")) !== true) throw new Error("smoke: same-user should be allowed");',
    'const tenant = await ctx.tenantRuntime.tenants.ensure("acme", {',
    '  isolateServices: ["tenantAuth"],',
    '  setup: ({ ctx: tenantCtx }) => { tenantCtx.provide("tenantAuth", "auth-A"); },',
    '});',
    'if (tenant.ctx.get("tenantAuth") !== "auth-A") throw new Error("smoke: tenant capability did not resolve");',
    'if (ctx.get("tenantAuth") !== undefined) throw new Error("smoke: tenant capability leaked to root");',
    'const principal = await tenant.principals.ensure("alice");',
    'await principal.ctx.multiTenant.claimSession("s2", principal.identity);',
    'const ownerFromRoot = await ctx.multiTenant.getSessionOwner("s2");',
    'if (ownerFromRoot?.tenantId !== "acme" || ownerFromRoot?.userId !== "alice") throw new Error("smoke: ownership kernel state did not cross context boundary");',
    'await assertTenantSessionStoreContract(async (c) => { await c.plugin(Store); return c.tenantSessionStore });',
    'await assertRuntimeCapabilityProviderContract({',
    '  serviceName: "smokeCapability",',
    '  level: "tenant",',
    '  mount: (scopeCtx, marker) => { scopeCtx.provide("smokeCapability", marker); },',
    '  fingerprint: scopeCtx => scopeCtx.get("smokeCapability"),',
    '});',
    'const ambient = ctx.plugin(function smokeDeploymentProvider(providerCtx) {',
    '  providerCtx.provide("smokeDeployment", "deployment-ready");',
    '});',
    'await ambient;',
    'const plan = compileSaaSDefinition({',
    '  capabilities: [',
    '    { key: "smokeDeployment", scope: "deployment", required: true },',
    '    { key: "smokeTenant", scope: "tenant", required: true },',
    '    { key: "smokePrincipal", scope: "principal", required: true },',
    '    { key: "smokeOperation", scope: "operation", required: true },',
    '  ],',
    '  providers: [',
    '    { id: "ambient", capability: "smokeDeployment", scope: "deployment" },',
    '    { id: "tenant", capability: "smokeTenant", scope: "tenant", setup: ({ ctx: c }) => { c.provide("smokeTenant", "tenant-ready"); } },',
    '    { id: "principal", capability: "smokePrincipal", scope: "principal", requires: ["smokeTenant"], setup: ({ ctx: c }) => { c.provide("smokePrincipal", "principal-ready"); } },',
    '    { id: "operation", capability: "smokeOperation", scope: "operation", requires: ["smokePrincipal"], setup: ({ ctx: c }) => { c.provide("smokeOperation", "operation-ready"); } },',
    '  ],',
    '});',
    'const deployment = await bootstrapDeploymentComposition(ctx, plan);',
    'const saasTenant = await ctx.tenantRuntime.tenants.ensure("saas-acme", tenantDefinitionFromPlan(plan));',
    'const saasAlice = await saasTenant.principals.ensure("alice", principalDefinitionFromPlan(plan));',
    'const operation = saasAlice.operations.start({',
    '  ...operationDefinitionFromPlan(plan),',
    '  requires: ["smokeDeployment", "smokeTenant", "smokePrincipal", "smokeOperation"],',
    '  execute: ({ capabilities }) => capabilities.keys.map(key => capabilities.require(key)).join("|"),',
    '});',
    'const operationValue = await operation.result;',
    'if (operationValue !== "deployment-ready|operation-ready|principal-ready|tenant-ready") throw new Error(`smoke: unexpected Operation snapshot ${operationValue}`);',
    'if (operation.state !== "disposed" || saasAlice.operations.size !== 0) throw new Error("smoke: Operation did not become quiescent");',
    'const missing = saasAlice.operations.start({ requires: ["missing"], execute() { throw new Error("must not execute"); } });',
    'let missingFailed = false;',
    'try { await missing.result; } catch (error) { missingFailed = error instanceof OperationDependencyUnavailableError; }',
    'if (!missingFailed) throw new Error("smoke: packaged Operation dependency error contract failed");',
    'await saasTenant.dispose();',
    'await deployment.dispose();',
    'await ambient.dispose();',
    'await tenant.dispose();',
    'await ctx.fiber.dispose();',
    'console.log("consumer smoke passed");',
  ].join('\n'))
  execFileSync('node', ['smoke.mjs'], { cwd: consumer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

  console.log(`package smoke passed: ${tarball}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
  rmSync(consumer, { recursive: true, force: true })
}
