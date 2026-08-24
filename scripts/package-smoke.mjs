#!/usr/bin/env node
/**
 * Packed-consumer smoke for the contract users actually install.
 *
 * Build -> pack -> verify public export targets -> install in a clean consumer
 * -> exercise ownership kernel + bound RuntimeComposition + M4 ingress/
 * credentials + M5 Tenant MCP public contracts through package subpaths.
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

  const tarball = readdirSync(tmp).find(file => file.endsWith('.tgz'))
  if (!tarball) throw new Error('pnpm pack produced no tarball')

  const listing = execFileSync('tar', ['-tzf', join(tmp, tarball)], { encoding: 'utf8' })
  const lines = listing.split('\n')
  const has = file => lines.some(line => line === file || line.endsWith(`/${file}`))

  const required = [
    'package.json',
    'dist/index.mjs',
    'dist/runtime.mjs',
    'dist/operation.mjs',
    'dist/composition.mjs',
    'dist/runtime-composition.mjs',
    'dist/ingress.mjs',
    'dist/credentials.mjs',
    'dist/mcp.mjs',
    'dist/store.mjs',
    'dist/testing.mjs',
    'cordis.patch.yml',
    'README.md',
    'LICENSE',
  ]
  const missing = required.filter(file => !has(file))
  if (missing.length) throw new Error(`tarball is missing: ${missing.join(', ')}`)

  const targets = collectTargets(pkg.exports)
  const unresolved = targets.filter(target => !has(target.replace(/^\.\//, '')))
  if (unresolved.length) throw new Error(`exports targets missing from tarball: ${unresolved.join(', ')}`)

  writeFileSync(join(consumer, 'package.json'), JSON.stringify({
    name: 'smoke-consumer',
    private: true,
    type: 'module',
  }))
  execFileSync('pnpm', ['add', join(tmp, tarball), '@deepseek-ai/cordis@4.0.1'], {
    cwd: consumer,
    stdio: 'ignore',
  })

  writeFileSync(join(consumer, 'smoke.mjs'), `
import { Context } from '@deepseek-ai/cordis'
import Service, {
  CredentialUnavailableError,
  InMemoryPrincipalCredentials,
  RuntimeCompositionConflictError,
  compileSaaSDefinition,
  createProductIngress,
  definePrincipalCredentialsProvider,
  defineTenantMcpConfigProvider,
  materializeRuntimeComposition,
  normalizeTenantMcpConfig,
  principalCredentials,
  runtimeMcpServerName,
  tenantMcpConfig,
} from 'dsh-multi-tenant'
import Store from 'dsh-multi-tenant/store'
import Runtime from 'dsh-multi-tenant/runtime'
import { materializeRuntimeComposition as materializeFromSubpath } from 'dsh-multi-tenant/runtime-composition'
import { createProductIngress as ingressFromSubpath } from 'dsh-multi-tenant/ingress'
import { principalCredentials as credentialsFromSubpath } from 'dsh-multi-tenant/credentials'
import {
  tenantMcpConfig as mcpFromSubpath,
  runtimeMcpServerName as runtimeNameFromSubpath,
} from 'dsh-multi-tenant/mcp'

if (materializeFromSubpath !== materializeRuntimeComposition) throw new Error('runtime-composition subpath mismatch')
if (ingressFromSubpath !== createProductIngress) throw new Error('ingress subpath mismatch')
if (credentialsFromSubpath !== principalCredentials) throw new Error('credentials subpath mismatch')
if (mcpFromSubpath !== tenantMcpConfig) throw new Error('mcp subpath token mismatch')
if (runtimeNameFromSubpath !== runtimeMcpServerName) throw new Error('mcp subpath runtime-name mismatch')

const ctx = new Context()
await ctx.plugin(Store)
await ctx.plugin(Service)
await ctx.plugin(Runtime)

const kernelPrincipal = { tenantId: 'kernel-acme', userId: 'alice' }
await ctx.multiTenant.claimSession('smoke-session', kernelPrincipal)
if (!(await ctx.multiTenant.canAccessSession(kernelPrincipal, 'smoke-session'))) {
  throw new Error('ownership kernel same-principal access failed')
}
if (await ctx.multiTenant.canAccessSession({ tenantId: 'globex', userId: 'alice' }, 'smoke-session')) {
  throw new Error('ownership kernel cross-tenant denial failed')
}

const makePlan = revision => compileSaaSDefinition({
  capabilities: [
    { capability: tenantMcpConfig, required: true },
    { capability: principalCredentials, required: true },
  ],
  providers: [
    defineTenantMcpConfigProvider({
      id: 'mcp-' + revision,
      definitionKey: revision,
      load({ tenantId }) {
        return {
          servers: [{
            transport: 'streamable-http',
            serverName: 'erp',
            url: 'https://mcp.example/' + tenantId,
            headers: { 'X-Tenant': tenantId },
            credentialHeaders: {
              Authorization: { credential: 'erpToken', prefix: 'Bearer ' },
            },
          }],
        }
      },
    }),
    definePrincipalCredentialsProvider({
      id: 'credentials-' + revision,
      definitionKey: revision,
      create({ principal }) {
        return new InMemoryPrincipalCredentials({
          erpToken: revision + ':' + principal.tenantId + '/' + principal.userId,
        })
      },
    }),
  ],
})

const v1 = makePlan('v1')
const app = await materializeRuntimeComposition(ctx, v1)
if ((await materializeRuntimeComposition(ctx, v1)) !== app) throw new Error('same Plan did not join')

let conflict = false
try {
  await materializeRuntimeComposition(ctx, makePlan('v2'))
} catch (error) {
  conflict = error instanceof RuntimeCompositionConflictError
}
if (!conflict) throw new Error('different active whole Plan did not conflict')

const ingress = createProductIngress(app, subject => ({
  tenantId: subject.org,
  userId: subject.user,
}))
const alice = await ingress.resolve({ org: 'acme', user: 'alice' })
const contractOperation = alice.operations.start({
  requires: [tenantMcpConfig, principalCredentials],
  async execute({ capabilities }) {
    const mcp = capabilities.require(tenantMcpConfig)
    const credentials = capabilities.require(principalCredentials)
    return {
      mcp,
      token: await credentials.require('erpToken'),
    }
  },
})
const contract = await contractOperation.result
if (contract.token !== 'v1:acme/alice') throw new Error('M5 credential path returned wrong value')
if (contract.mcp.servers[0]?.serverName !== 'erp') throw new Error('M5 Tenant MCP config did not materialize')
if (contract.mcp.servers[0]?.url !== 'https://mcp.example/acme') throw new Error('M5 Tenant MCP config used wrong Tenant')

const normalized = normalizeTenantMcpConfig(contract.mcp)
if (!Object.isFrozen(normalized) || !Object.isFrozen(normalized.servers)) throw new Error('M5 MCP config is not immutable')
const runtimeName = runtimeMcpServerName('erp', alice.identity, 'smoke-mcp-session')
if (runtimeName !== runtimeMcpServerName('erp', alice.identity, 'smoke-mcp-session')) {
  throw new Error('M5 runtime MCP namespace is not deterministic')
}
if (!/^[A-Za-z0-9_-]{1,32}$/.test(runtimeName)) throw new Error('M5 runtime MCP namespace violates DSH MCP serverName contract')

const missingOperation = alice.operations.start({
  requires: [principalCredentials],
  async execute({ capabilities }) {
    return capabilities.require(principalCredentials).require('missing')
  },
})
let missingCredential = false
try {
  await missingOperation.result
} catch (error) {
  missingCredential = error instanceof CredentialUnavailableError
}
if (!missingCredential) throw new Error('missing credential contract failed')

await app.dispose()
if (alice.runtime.state !== 'disposed') throw new Error('RuntimeComposition did not drain Principal')

const v2 = makePlan('v2')
const replacement = await materializeRuntimeComposition(ctx, v2)
const replacementIngress = createProductIngress(replacement, subject => ({
  tenantId: subject.org,
  userId: subject.user,
}))
const replacementAlice = await replacementIngress.resolve({ org: 'acme', user: 'alice' })
const replacementOperation = replacementAlice.operations.start({
  requires: [tenantMcpConfig, principalCredentials],
  async execute({ capabilities }) {
    return {
      token: await capabilities.require(principalCredentials).require('erpToken'),
      endpoint: capabilities.require(tenantMcpConfig).servers[0]?.url,
    }
  },
})
const replacementValue = await replacementOperation.result
if (replacementValue.token !== 'v2:acme/alice') throw new Error('provider replacement failed')
if (replacementValue.endpoint !== 'https://mcp.example/acme') throw new Error('MCP provider recreation failed')

await replacement.dispose()
await ctx.fiber.dispose()
console.log('consumer smoke passed')
`)

  execFileSync('node', ['smoke.mjs'], {
    cwd: consumer,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  console.log(`package smoke passed: ${tarball}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
  rmSync(consumer, { recursive: true, force: true })
}
