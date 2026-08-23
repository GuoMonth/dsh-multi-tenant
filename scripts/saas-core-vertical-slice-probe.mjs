#!/usr/bin/env node
/**
 * v0.3 M1-M3 vertical proof against the pinned public DSH Agent package.
 *
 * One CompositionPlan materializes Tenant/Principal/Operation providers,
 * Operations acquire one-shot capability snapshots, and the captured `agents`
 * capability must still bind DSH create/resume to the correct Operation/Principal
 * caller context.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_TARGET } from './dsh-target.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'dsh-mt-saas-core-'))
const src = join(tmp, 'src')

try {
  // Treat the module as one refactorable source unit. Evidence should verify
  // behavior, not pin an internal file list that becomes architectural drag.
  cpSync(join(root, 'packages', 'multi-tenant', 'src'), src, { recursive: true })

  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'saas-core-probe', private: true, type: 'module' }))
  writeFileSync(join(tmp, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: false\n')

  try {
    execFileSync('pnpm', [
      'add',
      '@deepseek-ai/cordis@4.0.1',
      'tsx@4',
      `@deepseek-ai/dsh-agent@${DSH_TARGET.version}`,
    ], {
      cwd: tmp,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new Error(
      `failed to install public DSH Agent contract at ${DSH_TARGET.version}\n${String(error.stdout ?? '').trim()}\n${String(error.stderr ?? '').trim()}`,
      { cause: error },
    )
  }

  writeFileSync(join(tmp, 'probe.ts'), `
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { InMemoryTenantSessionStore } from './src/store.ts'
import { MultiTenantService } from './src/service.ts'
import { TenantRuntimeService, principalOf, tenantIdOf } from './src/runtime.ts'
import {
  bootstrapDeploymentComposition,
  compileSaaSDefinition,
  operationDefinitionFromPlan,
  principalDefinitionFromPlan,
  tenantDefinitionFromPlan,
} from './src/composition.ts'

const assert = (condition, message) => { if (!condition) throw new Error('ASSERT FAILED: ' + message) }
const root = new Context()
await root.plugin(InMemoryTenantSessionStore)
await root.plugin(MultiTenantService)
await root.plugin(TenantRuntimeService)
await root.plugin(AgentRegistry)

const factoryObservations = []
let handleDisposals = 0

async function makeHandle(ownerCtx, id, setup) {
  const agentFiber = ownerCtx.plugin(function fakeAgentOwner() {})
  await agentFiber
  const agentCtx = agentFiber.ctx
  const commit = await setup?.(agentCtx)
  commit?.commit()
  let disposed = false
  return {
    agent: { id, ctx: agentCtx, session: { id } },
    async dispose() {
      if (disposed) return
      disposed = true
      handleDisposals += 1
      await agentFiber.dispose()
    },
  }
}

root.agents.setFactory({
  async createAgent(ownerCtx, options) {
    factoryObservations.push({
      kind: 'create',
      sessionId: options.sessionId,
      tenantId: tenantIdOf(ownerCtx),
      principal: principalOf(ownerCtx),
      tenantConfig: ownerCtx.get('tenantConfig'),
      credential: ownerCtx.get('credentials'),
      requestMarker: ownerCtx.get('requestMarker'),
    })
    return makeHandle(ownerCtx, options.sessionId, options.setup)
  },
  async resume(ownerCtx, options) {
    factoryObservations.push({
      kind: 'resume',
      sessionId: options.resumeSessionId,
      tenantId: tenantIdOf(ownerCtx),
      principal: principalOf(ownerCtx),
      tenantConfig: ownerCtx.get('tenantConfig'),
      credential: ownerCtx.get('credentials'),
      requestMarker: ownerCtx.get('requestMarker'),
    })
    return makeHandle(ownerCtx, options.resumeSessionId, options.setup)
  },
})

const plan = compileSaaSDefinition({
  capabilities: [
    { key: 'agents', scope: 'deployment', required: true },
    { key: 'tenantConfig', scope: 'tenant', required: true },
    { key: 'credentials', scope: 'principal', required: true },
    { key: 'requestMarker', scope: 'operation', required: true },
  ],
  providers: [
    { id: 'dsh-agents', capability: 'agents', scope: 'deployment' },
    {
      id: 'tenant-config',
      capability: 'tenantConfig',
      scope: 'tenant',
      setup({ ctx }) {
        ctx.provide('tenantConfig', 'tenant:' + tenantIdOf(ctx))
      },
    },
    {
      id: 'principal-credentials',
      capability: 'credentials',
      scope: 'principal',
      requires: ['tenantConfig'],
      setup({ ctx }) {
        const principal = principalOf(ctx)
        ctx.provide('credentials', 'credential:' + principal?.tenantId + '/' + principal?.userId)
      },
    },
    {
      id: 'operation-marker',
      capability: 'requestMarker',
      scope: 'operation',
      requires: ['agents', 'credentials'],
      setup({ ctx }) {
        const principal = principalOf(ctx)
        ctx.provide('requestMarker', 'operation:' + principal?.tenantId + '/' + principal?.userId)
      },
    },
  ],
})

const deployment = await bootstrapDeploymentComposition(root, plan)
const acme = await root.tenantRuntime.tenants.ensure('acme', tenantDefinitionFromPlan(plan))
const globex = await root.tenantRuntime.tenants.ensure('globex', tenantDefinitionFromPlan(plan))
const acmeAlice = await acme.principals.ensure('alice', principalDefinitionFromPlan(plan))
const acmeBob = await acme.principals.ensure('bob', principalDefinitionFromPlan(plan))
const globexAlice = await globex.principals.ensure('alice', principalDefinitionFromPlan(plan))
const operationScope = operationDefinitionFromPlan(plan)
let semanticExecutions = 0

async function createFrom(principalScope, sessionId) {
  const operation = principalScope.operations.start({
    ...operationScope,
    requires: ['agents', 'tenantConfig', 'credentials', 'requestMarker'],
    async execute({ capabilities }) {
      semanticExecutions += 1
      const agents = capabilities.require<any>('agents')
      const expectedTenant = 'tenant:' + principalScope.identity.tenantId
      const expectedCredential = 'credential:' + principalScope.identity.tenantId + '/' + principalScope.identity.userId
      const expectedMarker = 'operation:' + principalScope.identity.tenantId + '/' + principalScope.identity.userId
      assert(capabilities.require('tenantConfig') === expectedTenant, 'Operation snapshot tenant mismatch')
      assert(capabilities.require('credentials') === expectedCredential, 'Operation snapshot credential mismatch')
      assert(capabilities.require('requestMarker') === expectedMarker, 'Operation snapshot marker mismatch')
      const handle = await agents.create({
        sessionId,
        setup(agentCtx) {
          agentCtx.provide('probeAgentMarker', expectedMarker)
        },
      })
      assert(handle.agent.ctx.get('probeAgentMarker') === expectedMarker, 'Agent setup did not run before handle return')
      await handle.dispose()
      return { expectedTenant, expectedCredential, expectedMarker }
    },
  })
  return operation.result
}

await Promise.all([
  createFrom(acmeAlice, 'acme-alice-1'),
  createFrom(acmeBob, 'acme-bob-1'),
  createFrom(globexAlice, 'globex-alice-1'),
])

const resumeOperation = acmeAlice.operations.start({
  ...operationScope,
  requires: ['agents', 'tenantConfig', 'credentials', 'requestMarker'],
  async execute({ capabilities }) {
    semanticExecutions += 1
    const agents = capabilities.require<any>('agents')
    const handle = await agents.resume({ resumeSessionId: 'acme-alice-persisted' })
    await handle.dispose()
  },
})
await resumeOperation.result

assert(semanticExecutions === 4, 'each user-visible Operation must execute exactly once')
assert(factoryObservations.length === 4, 'factory must observe three creates and one resume')

const expected = new Map([
  ['acme-alice-1', ['acme', 'alice']],
  ['acme-bob-1', ['acme', 'bob']],
  ['globex-alice-1', ['globex', 'alice']],
  ['acme-alice-persisted', ['acme', 'alice']],
])
for (const observed of factoryObservations) {
  const pair = expected.get(observed.sessionId)
  assert(pair, 'unexpected factory session: ' + observed.sessionId)
  assert(observed.tenantId === pair[0], 'DSH ownerCtx tenant mismatch for ' + observed.sessionId)
  assert(observed.principal?.userId === pair[1], 'DSH ownerCtx principal mismatch for ' + observed.sessionId)
  assert(observed.tenantConfig === 'tenant:' + pair[0], 'factory tenant capability mismatch')
  assert(observed.credential === 'credential:' + pair[0] + '/' + pair[1], 'factory credential mismatch')
  assert(observed.requestMarker === 'operation:' + pair[0] + '/' + pair[1], 'factory operation capability mismatch')
}
assert(handleDisposals === 4, 'all fake DSH handles must be disposed')

await acme.dispose()
assert(acmeBob.state === 'disposed', 'Tenant teardown must dispose sibling Principal Bob')
assert(globexAlice.state === 'active', 'disposing Acme must not affect Globex/Alice')
await globex.dispose()
await deployment.dispose()
await root.fiber.dispose()

console.log(JSON.stringify({ semanticExecutions, factoryObservations, handleDisposals }))
`)

  const out = execFileSync('pnpm', ['exec', 'tsx', 'probe.ts'], {
    cwd: tmp,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log(`v0.3 SaaS core vertical proof passed on DSH ${DSH_TARGET.version}: ${out.trim()}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
