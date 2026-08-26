#!/usr/bin/env node
/**
 * Validate the contract an installed v0.3 consumer actually receives.
 *
 * Usage:
 *   node scripts/artifact-consumer-smoke.mjs --local
 *   node scripts/artifact-consumer-smoke.mjs dsh-multi-tenant@0.3.0-rc.3
 *
 * --local builds/packs the current workspace first, verifies tarball/export
 * completeness, then installs the candidate beside the pinned DSH CLI. Registry
 * verification passes an exact npm spec. Both paths exercise the v0.3 Product
 * Ingress / RuntimeComposition / Credentials / MCP surface, import the product,
 * Web, diagnostics, starter and SQLite-store subpaths, and trigger the packaged
 * dynamic import of the official MCP client.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const requested = process.argv[2]
if (!requested) {
  console.error('usage: node scripts/artifact-consumer-smoke.mjs <package-spec|--local>')
  process.exit(2)
}

function collectTargets(value, acc = []) {
  if (typeof value === 'string') {
    acc.push(value)
    return acc
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectTargets(child, acc)
  }
  return acc
}

const consumer = mkdtempSync(join(tmpdir(), 'dsh-mt-artifact-consumer-'))
const packDir = requested === '--local' ? mkdtempSync(join(tmpdir(), 'dsh-mt-artifact-pack-')) : undefined

try {
  let packageSpec = requested
  if (requested === '--local') {
    execFileSync('pnpm', ['--filter', 'dsh-multi-tenant', 'build'], { cwd: root, stdio: 'ignore' })
    execFileSync('pnpm', ['--filter', 'dsh-multi-tenant', 'pack', '--pack-destination', packDir], {
      cwd: root,
      stdio: 'ignore',
    })
    const tarball = readdirSync(packDir).find(file => file.endsWith('.tgz'))
    if (!tarball) throw new Error('local artifact smoke: pnpm pack produced no tarball')
    packageSpec = join(packDir, tarball)

    const pkg = JSON.parse(readFileSync(join(root, 'packages', 'multi-tenant', 'package.json'), 'utf8'))
    const listing = execFileSync('tar', ['-tzf', packageSpec], { encoding: 'utf8' }).split('\n')
    const has = file => listing.some(line => line === file || line.endsWith(`/${file}`))
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
      'dist/product.mjs',
      'dist/web.mjs',
      'dist/diagnostics.mjs',
      'dist/starter-plugin.mjs',
      'dist/store.mjs',
      'dist/sqlite-store.mjs',
      'dist/testing.mjs',
      'cordis.patch.yml',
      'README.md',
      'LICENSE',
    ]
    const missing = required.filter(file => !has(file))
    if (missing.length) throw new Error(`local artifact smoke: tarball is missing ${missing.join(', ')}`)

    const unresolved = collectTargets(pkg.exports)
      .map(target => target.replace(/^\.\//, ''))
      .filter(target => !has(target))
    if (unresolved.length) {
      throw new Error(`local artifact smoke: export targets missing from tarball: ${unresolved.join(', ')}`)
    }
  }

  writeFileSync(join(consumer, 'package.json'), JSON.stringify({
    name: 'dsh-multi-tenant-artifact-consumer',
    private: true,
    type: 'module',
  }))
  writeFileSync(join(consumer, 'pnpm-workspace.yaml'), [
    'allowBuilds:',
    "  '@deepseek-ai/dsh-subprocess-local': true",
    "  '@google/genai': true",
    '  koffi: true',
    '  node-pty: true',
    '  protobufjs: true',
    '',
  ].join('\n'))

  execFileSync('pnpm', [
    'add',
    '@deepseek-ai/dsh@0.1.1-rc.2',
    '@deepseek-ai/cordis@4.0.1',
    packageSpec,
  ], {
    cwd: consumer,
    stdio: 'ignore',
  })

  writeFileSync(join(consumer, 'smoke.mjs'), `
import { Context } from '@deepseek-ai/cordis'
import Service, {
  InMemoryPrincipalCredentials,
  compileSaaSDefinition,
  createMcpAgentIntegration,
  createProductIngress,
  definePrincipalCredentialsProvider,
  defineTenantMcpConfigProvider,
  materializeRuntimeComposition,
  principalCredentials,
  runtimeMcpServerName,
  tenantMcpConfig,
} from 'dsh-multi-tenant'
import Store from 'dsh-multi-tenant/store'
import SQLiteStore from 'dsh-multi-tenant/sqlite-store'
import Runtime from 'dsh-multi-tenant/runtime'
import { materializeRuntimeComposition as materializeFromSubpath } from 'dsh-multi-tenant/runtime-composition'
import { createProductIngress as ingressFromSubpath } from 'dsh-multi-tenant/ingress'
import { principalCredentials as credentialsFromSubpath } from 'dsh-multi-tenant/credentials'
import { tenantMcpConfig as mcpFromSubpath } from 'dsh-multi-tenant/mcp'
import { createMcpSaaSRuntime } from 'dsh-multi-tenant/product'
import { mountMcpSaaSWebBridge, readBearerToken, readCookie } from 'dsh-multi-tenant/web'
import { toProductDiagnostic } from 'dsh-multi-tenant/diagnostics'
import * as Starter from 'dsh-multi-tenant/starter'

if (materializeFromSubpath !== materializeRuntimeComposition) throw new Error('artifact smoke: runtime-composition export mismatch')
if (ingressFromSubpath !== createProductIngress) throw new Error('artifact smoke: ingress export mismatch')
if (credentialsFromSubpath !== principalCredentials) throw new Error('artifact smoke: credentials export mismatch')
if (mcpFromSubpath !== tenantMcpConfig) throw new Error('artifact smoke: MCP export mismatch')
if (typeof createMcpSaaSRuntime !== 'function') throw new Error('artifact smoke: product facade export missing')
if (typeof SQLiteStore !== 'function') throw new Error('artifact smoke: SQLite store export missing')
if (typeof mountMcpSaaSWebBridge !== 'function' || typeof readBearerToken !== 'function' || typeof readCookie !== 'function') {
  throw new Error('artifact smoke: Web product surface export missing')
}
if (typeof toProductDiagnostic !== 'function') throw new Error('artifact smoke: diagnostics export missing')
if (typeof Starter.apply !== 'function' || Starter.name !== 'multi-tenant-starter') {
  throw new Error('artifact smoke: starter plugin export missing')
}

const sqlitePath = './artifact-session-ownership.sqlite'
const sqliteFirst = new Context()
await sqliteFirst.plugin(SQLiteStore, { path: sqlitePath })
if (await sqliteFirst.tenantSessionStore.claim('artifact-persisted', { tenantId: 'acme', userId: 'alice' }) !== 'created') {
  throw new Error('artifact smoke: SQLite first claim failed')
}
await sqliteFirst.fiber.dispose()
const sqliteSecond = new Context()
await sqliteSecond.plugin(SQLiteStore, { path: sqlitePath })
if (await sqliteSecond.tenantSessionStore.claim('artifact-persisted', { tenantId: 'acme', userId: 'alice' }) !== 'idempotent') {
  throw new Error('artifact smoke: installed SQLite store did not persist across reopen')
}
if (await sqliteSecond.tenantSessionStore.claim('artifact-persisted', { tenantId: 'acme', userId: 'bob' }) !== 'conflict') {
  throw new Error('artifact smoke: installed SQLite store allowed ownership takeover')
}
await sqliteSecond.fiber.dispose()

const ctx = new Context()
await ctx.plugin(Store)
await ctx.plugin(Service)
await ctx.plugin(Runtime)

let resolvedMcpPlugin
let createCalls = 0
let resumeCalls = 0
const fakeAgentCtx = {
  async plugin(plugin) {
    resolvedMcpPlugin = plugin
  },
}
const agents = {
  async create(options) {
    createCalls += 1
    await options.setup?.(fakeAgentCtx)
    return { agent: { id: options.sessionId, ctx: fakeAgentCtx }, async dispose() {} }
  },
  async resume(options) {
    resumeCalls += 1
    await options.setup?.(fakeAgentCtx)
    return { agent: { id: options.resumeSessionId, ctx: fakeAgentCtx }, async dispose() {} }
  },
}
ctx.provide('agents', agents)

const plan = compileSaaSDefinition({
  capabilities: [
    { capability: tenantMcpConfig, required: true },
    { capability: principalCredentials, required: true },
  ],
  providers: [
    defineTenantMcpConfigProvider({
      id: 'artifact-mcp',
      definitionKey: 'artifact-v1',
      load({ tenantId }) {
        return {
          servers: [{
            transport: 'stdio',
            serverName: 'erp',
            command: 'true',
            env: { TENANT_ID: tenantId },
            credentialEnv: { API_TOKEN: { credential: 'apiToken', prefix: 'Bearer ' } },
            reconnect: { enabled: false },
          }],
        }
      },
    }),
    definePrincipalCredentialsProvider({
      id: 'artifact-credentials',
      definitionKey: 'artifact-v1',
      create({ principal }) {
        return new InMemoryPrincipalCredentials({ apiToken: principal.tenantId + '/' + principal.userId })
      },
    }),
  ],
})

const app = await materializeRuntimeComposition(ctx, plan)
const ingress = createProductIngress(app, subject => ({ tenantId: subject.tenant, userId: subject.user }))
const alice = await ingress.resolve({ tenant: 'acme', user: 'alice' })
const bob = await ingress.resolve({ tenant: 'acme', user: 'bob' })

const operation = alice.operations.start({
  requires: [tenantMcpConfig, principalCredentials],
  async execute({ capabilities }) {
    return {
      endpointTenant: capabilities.require(tenantMcpConfig).servers[0]?.env?.TENANT_ID,
      credential: await capabilities.require(principalCredentials).require('apiToken'),
    }
  },
})
const observed = await operation.result
if (observed.endpointTenant !== 'acme') throw new Error('artifact smoke: Tenant MCP config crossed identity')
if (observed.credential !== 'acme/alice') throw new Error('artifact smoke: Principal credential crossed identity')

const integration = createMcpAgentIntegration(alice)
const created = await integration.create({ sessionId: 'artifact-alice-s1' })
if (createCalls !== 1) throw new Error('artifact smoke: create did not reach DSH Agent seam exactly once')
if (!resolvedMcpPlugin || typeof resolvedMcpPlugin.apply !== 'function') {
  throw new Error('artifact smoke: packaged path could not resolve official @deepseek-ai/dsh-mcp-client')
}
const runtimeName = created.servers[0]?.runtimeServerName
if (runtimeName !== runtimeMcpServerName('erp', alice.identity, 'artifact-alice-s1')) {
  throw new Error('artifact smoke: runtime MCP namespace is not deterministic')
}

const bobIntegration = createMcpAgentIntegration(bob)
let denied = false
try {
  await bobIntegration.resume({ sessionId: 'artifact-alice-s1' })
} catch (error) {
  denied = error?.name === 'SessionAccessDeniedError'
}
if (!denied) throw new Error('artifact smoke: cross-Principal resume was not denied')
if (resumeCalls !== 0) throw new Error('artifact smoke: denied resume reached DSH Agent seam')

await created.dispose()
await app.dispose()
await ctx.fiber.dispose()
console.log('v0.3 installed artifact consumer smoke passed')
`)

  execFileSync('node', ['smoke.mjs'], {
    cwd: consumer,
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  console.log(`artifact consumer smoke passed: ${packageSpec}`)
} finally {
  rmSync(consumer, { recursive: true, force: true })
  if (packDir !== undefined) rmSync(packDir, { recursive: true, force: true })
}