#!/usr/bin/env node
/**
 * M5 executable proof against the pinned public DSH Agent/Scope/Tools/MCP packages.
 *
 * This is deliberately not a mock-MCP test. It starts a real stdio MCP server,
 * lets the official @deepseek-ai/dsh-mcp-client discover/register its tools,
 * and executes those tools through the real DSH ToolRuntime pipeline.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_TARGET } from './dsh-target.mjs'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'dsh-mt-m5-'))
const src = join(tmp, 'src')
const fixture = join(tmp, 'mcp-identity-server.mjs')

const dsh = name => `@deepseek-ai/${name}@${DSH_TARGET.version}`

try {
  cpSync(join(rootDir, 'packages', 'multi-tenant', 'src'), src, { recursive: true })
  cpSync(join(rootDir, 'scripts', 'fixtures', 'mcp-identity-server.mjs'), fixture)
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'm5-mcp-probe', private: true, type: 'module' }))
  writeFileSync(join(tmp, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: false\n')

  const dependencies = [
    '@deepseek-ai/cordis@4.0.1',
    'tsx@4',
    'zod@4.4.3',
    '@modelcontextprotocol/sdk@1.12.0',
    dsh('dsh-agent'),
    dsh('dsh-scope'),
    dsh('dsh-session'),
    dsh('dsh-system-prompt'),
    dsh('dsh-tools'),
    dsh('dsh-code-runtime'),
    dsh('dsh-user-approval'),
    dsh('dsh-invariants'),
    dsh('dsh-llm'),
    dsh('dsh-attachment'),
    dsh('dsh-subprocess'),
    dsh('dsh-timeout'),
    dsh('dsh-mcp-client'),
  ]
  try {
    execFileSync('pnpm', ['add', ...dependencies], {
      cwd: tmp,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new Error(
      `failed to install pinned M5 DSH contracts at ${DSH_TARGET.version}\n${String(error.stdout ?? '').trim()}\n${String(error.stderr ?? '').trim()}`,
      { cause: error },
    )
  }

  writeFileSync(join(tmp, 'probe.ts'), `
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { compileSaaSDefinition } from './src/composition.ts'
import { InMemoryPrincipalCredentials, definePrincipalCredentialsProvider, principalCredentials } from './src/credentials.ts'
import { createProductIngress } from './src/ingress.ts'
import {
  createMcpAgentIntegration,
  defineTenantMcpConfigProvider,
  tenantMcpConfig,
} from './src/mcp.ts'
import { materializeRuntimeComposition } from './src/runtime-composition.ts'
import { TenantRuntimeService } from './src/runtime.ts'
import { MultiTenantService } from './src/service.ts'
import { InMemoryTenantSessionStore } from './src/store.ts'

const fixture = ${JSON.stringify(fixture)}
const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error('ASSERT FAILED: ' + message)
}
const root = new Context()
await root.plugin(InMemoryTenantSessionStore)
await root.plugin(MultiTenantService)
await root.plugin(TenantRuntimeService)
await root.plugin(SystemPrompt)
await root.plugin(ToolRuntime)
await root.plugin(AgentRegistry)

// --- Exact upstream assumption: DSH scopes share one Cordis root and the
// official MCP client reserves serverName root-wide, even though ToolRuntime
// registrations themselves are scope-aware.
const scopeA = createScope(root, { id: 'scope-a' })
const scopeB = createScope(root, { id: 'scope-b' })
assert(scopeA.ctx.root === root.root && scopeB.ctx.root === root.root, 'DSH scopes must share the app Cordis root')
const collisionConfig = {
  transport: 'stdio' as const,
  serverName: 'collision',
  command: process.execPath,
  args: [fixture],
  env: {},
  cwd: '',
  toolCallTimeoutMs: 5_000,
  failOnStartupError: true,
}
const collisionOne = scopeA.ctx.plugin(McpClient, collisionConfig)
await collisionOne
let duplicateRejected = false
try {
  const collisionTwo = scopeB.ctx.plugin(McpClient, collisionConfig)
  await collisionTwo
} catch (error) {
  duplicateRejected = String((error as Error)?.message ?? error).includes('already in use')
}
assert(duplicateRejected, 'official MCP client must reject duplicate root-wide serverName')
await scopeA.dispose()
await scopeB.dispose()

// --- Fake only the Agent factory. Agent contexts use the real DSH createScope
// primitive, real ToolRuntime and real MCP client. This keeps the proof free of
// LLM/provider requirements while exercising the public AgentRegistry seam.
const liveAgents = new Map<string, any>()
let createCalls = 0
let resumeCalls = 0
let agentDisposals = 0

async function makeHandle(ownerCtx: Context, id: string, setup: ((ctx: Context) => any) | undefined) {
  const agent: any = { id, options: {}, session: { id } }
  const scope = createScope(root, agent)
  agent.ctx = scope.ctx.extend({ agent })
  let disposed = false
  let disposing: Promise<void> | undefined
  const dispose = (): Promise<void> => (disposing ??= (async () => {
    if (disposed) return
    disposed = true
    liveAgents.delete(id)
    agentDisposals += 1
    await scope.dispose()
  })())
  ownerCtx.effect(() => () => dispose(), 'm5-probe.owner')
  try {
    const commit = await setup?.(agent.ctx)
    commit?.commit?.()
  } catch (error) {
    await dispose()
    throw error
  }
  liveAgents.set(id, agent)
  return { agent, dispose }
}

root.agents.setFactory({
  async createAgent(ownerCtx, options) {
    createCalls += 1
    return makeHandle(ownerCtx, options.sessionId, options.setup)
  },
  async resume(ownerCtx, options) {
    resumeCalls += 1
    return makeHandle(ownerCtx, options.resumeSessionId, options.setup)
  },
})

const mcpProvider = defineTenantMcpConfigProvider({
  id: 'tenant-mcp',
  definitionKey: 'fixture-v1',
  load({ tenantId }) {
    return {
      servers: [{
        transport: 'stdio',
        serverName: 'erp',
        command: process.execPath,
        args: [fixture],
        env: {
          TENANT_ID: tenantId,
          ...(tenantId === 'broken' ? { FAIL_START: '1' } : {}),
        },
        credentialEnv: {
          USER_ID: { credential: 'userId' },
          API_TOKEN: { credential: 'apiToken', prefix: 'token:' },
        },
        toolCallTimeoutMs: 5_000,
        reconnect: { enabled: false },
      }],
    }
  },
})
const credentialsProvider = definePrincipalCredentialsProvider({
  id: 'principal-credentials',
  definitionKey: 'fixture-v1',
  create({ principal }) {
    return new InMemoryPrincipalCredentials({
      userId: principal.userId,
      apiToken: principal.tenantId + '/' + principal.userId,
    })
  },
})
const plan = compileSaaSDefinition({
  capabilities: [
    { capability: tenantMcpConfig, required: true },
    { capability: principalCredentials, required: true },
  ],
  providers: [mcpProvider, credentialsProvider],
})
const app = await materializeRuntimeComposition(root, plan)
const ingress = createProductIngress(app, (subject: { tenant: string; user: string }) => ({
  tenantId: subject.tenant,
  userId: subject.user,
}))
const acmeAlice = await ingress.resolve({ tenant: 'acme', user: 'alice' })
const acmeBob = await ingress.resolve({ tenant: 'acme', user: 'bob' })
const globexAlice = await ingress.resolve({ tenant: 'globex', user: 'alice' })

const aliceMcp = createMcpAgentIntegration(acmeAlice)
const bobMcp = createMcpAgentIntegration(acmeBob)
const globexMcp = createMcpAgentIntegration(globexAlice)

const [aliceHandle, bobHandle, globexHandle] = await Promise.all([
  aliceMcp.create({ sessionId: 'acme-alice-s1' }),
  bobMcp.create({ sessionId: 'acme-bob-s1' }),
  globexMcp.create({ sessionId: 'globex-alice-s1' }),
])
assert(createCalls === 3, 'three concurrent product creates must reach DSH exactly once each')
assert(liveAgents.size === 3, 'Agents must survive completion of their short create Operations')

const runtimeNames = [
  aliceHandle.servers[0]?.runtimeServerName,
  bobHandle.servers[0]?.runtimeServerName,
  globexHandle.servers[0]?.runtimeServerName,
]
assert(runtimeNames.every(Boolean), 'each Agent must expose its runtime MCP namespace')
assert(new Set(runtimeNames).size === 3, 'same logical serverName must not collide across Principal Sessions')

async function whoAmI(handle: any) {
  const server = handle.servers[0]
  const name = server.toolPrefix + 'who_am_i'
  assert(root.tools.get(name) === undefined, 'Agent-scoped MCP tool must not be globally visible')
  assert(root.tools.get(name, handle.agent) !== undefined, 'Agent-scoped MCP tool must be visible to its Agent')
  const result: any = await root.tools.execute({
    callId: 'call-' + handle.sessionId,
    name,
    arguments: {},
    signal: new AbortController().signal,
    agent: handle.agent,
  })
  assert(result.isError === false, 'real MCP tool execution must succeed')
  const value = result.value
  const text = value?.content?.find((block: any) => block?.type === 'text')?.text
  assert(typeof text === 'string', 'MCP result must contain text')
  return JSON.parse(text)
}

const identities = await Promise.all([
  whoAmI(aliceHandle),
  whoAmI(bobHandle),
  whoAmI(globexHandle),
])
assert(JSON.stringify(identities[0]) === JSON.stringify({ tenant: 'acme', user: 'alice', credential: 'token:acme/alice' }), 'Acme/Alice MCP identity mismatch')
assert(JSON.stringify(identities[1]) === JSON.stringify({ tenant: 'acme', user: 'bob', credential: 'token:acme/bob' }), 'Acme/Bob MCP identity mismatch')
assert(JSON.stringify(identities[2]) === JSON.stringify({ tenant: 'globex', user: 'alice', credential: 'token:globex/alice' }), 'Globex/Alice MCP identity mismatch')

const aliceOwner = await root.multiTenant.getSessionOwner('acme-alice-s1')
assert(aliceOwner?.tenantId === 'acme' && aliceOwner.userId === 'alice', 'create must reserve Session ownership for the Principal')

const resumeCallsBeforeDenial = resumeCalls
let denied = false
try {
  await bobMcp.resume({ sessionId: 'acme-alice-s1' })
} catch (error) {
  denied = (error as Error)?.name === 'SessionAccessDeniedError'
}
assert(denied, 'cross-Principal resume must fail closed')
assert(resumeCalls === resumeCallsBeforeDenial, 'denied resume must not reach DSH factory')

const aliceRuntimeName = aliceHandle.servers[0]?.runtimeServerName
const aliceAgent = aliceHandle.agent
await aliceHandle.dispose()
assert(root.tools.get(aliceHandle.servers[0]!.toolPrefix + 'who_am_i', aliceAgent) === undefined, 'Agent dispose must unregister MCP tools')
const resumed = await aliceMcp.resume({ sessionId: 'acme-alice-s1' })
assert(resumeCalls === resumeCallsBeforeDenial + 1, 'authorized resume must reach DSH once')
assert(resumed.servers[0]?.runtimeServerName === aliceRuntimeName, 'same Principal Session must keep stable MCP runtime namespace across resume')
const resumedIdentity = await whoAmI(resumed)
assert(resumedIdentity.user === 'alice' && resumedIdentity.tenant === 'acme', 'resumed Agent must retain Principal/Tenant MCP identity')

// A failed downstream MCP startup leaves no published/live Agent, but the
// claim-once ownership reservation remains fail-closed for the same Principal.
const brokenPrincipal = await ingress.resolve({ tenant: 'broken', user: 'alice' })
const brokenMcp = createMcpAgentIntegration(brokenPrincipal)
let startupFailed = false
try {
  await brokenMcp.create({ sessionId: 'broken-alice-s1' })
} catch {
  startupFailed = true
}
assert(startupFailed, 'MCP startup failure must reject Agent creation')
assert(!liveAgents.has('broken-alice-s1'), 'failed MCP setup must leave no live Agent')
const brokenOwner = await root.multiTenant.getSessionOwner('broken-alice-s1')
assert(brokenOwner?.tenantId === 'broken' && brokenOwner.userId === 'alice', 'failed create must retain fail-closed ownership reservation')

// Principal lifecycle owns the long-lived Agent even though the create/resume
// Operation already completed.
const resumedAgent = resumed.agent
const resumedTool = resumed.servers[0]!.toolPrefix + 'who_am_i'
await acmeAlice.runtime.dispose()
assert(root.tools.get(resumedTool, resumedAgent) === undefined, 'Principal teardown must drain Agent-scoped MCP tools')
assert(!liveAgents.has('acme-alice-s1'), 'Principal teardown must drain its live DSH Agent')

await bobHandle.dispose()
await globexHandle.dispose()
await app.dispose()
await root.fiber.dispose()
assert(agentDisposals >= 5, 'all successful/failed probe Agent scopes must quiesce')

console.log(JSON.stringify({
  m5: 'passed',
  createCalls,
  resumeCalls,
  runtimeNames,
  identities,
  sessionReservation: aliceOwner,
  failedReservation: brokenOwner,
}, null, 2))
`)

  execFileSync('pnpm', ['exec', 'tsx', 'probe.ts'], {
    cwd: tmp,
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  console.log(`M5 real MCP Agent integration probe passed on DSH ${DSH_TARGET.version}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
