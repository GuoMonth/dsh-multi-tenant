#!/usr/bin/env node
/**
 * Validate the contract an installed v0.3 consumer actually receives.
 *
 * Usage:
 *   node scripts/artifact-consumer-smoke.mjs --local
 *   node scripts/artifact-consumer-smoke.mjs dsh-multi-tenant@0.3.0-rc.1
 *
 * --local builds/packs the current workspace first. Registry verification passes
 * an exact npm spec. Both paths install the candidate beside the pinned DSH CLI,
 * then exercise the v0.3 Product Ingress / RuntimeComposition / Credentials / MCP
 * surface and trigger the packaged M5 dynamic import of the official MCP client.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const requested = process.argv[2]
if (!requested) {
  console.error('usage: node scripts/artifact-consumer-smoke.mjs <package-spec|--local>')
  process.exit(2)
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
import Runtime from 'dsh-multi-tenant/runtime'

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
    return {
      agent: { id: options.sessionId, ctx: fakeAgentCtx },
      async dispose() {},
    }
  },
  async resume(options) {
    resumeCalls += 1
    await options.setup?.(fakeAgentCtx)
    return {
      agent: { id: options.resumeSessionId, ctx: fakeAgentCtx },
      async dispose() {},
    }
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
            credentialEnv: {
              API_TOKEN: { credential: 'apiToken', prefix: 'Bearer ' },
            },
            reconnect: { enabled: false },
          }],
        }
      },
    }),
    definePrincipalCredentialsProvider({
      id: 'artifact-credentials',
      definitionKey: 'artifact-v1',
      create({ principal }) {
        return new InMemoryPrincipalCredentials({
          apiToken: principal.tenantId + '/' + principal.userId,
        })
      },
    }),
  ],
})

const app = await materializeRuntimeComposition(ctx, plan)
const ingress = createProductIngress(app, subject => ({
  tenantId: subject.tenant,
  userId: subject.user,
}))
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
  throw new Error('artifact smoke: packaged M5 path could not resolve official @deepseek-ai/dsh-mcp-client')
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
