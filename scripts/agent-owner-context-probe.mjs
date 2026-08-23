#!/usr/bin/env node
/**
 * DSH Agent owner-context proof.
 *
 * A canonical Principal Context is a capability/composition root, not a bypass
 * around Cordis injection. Agent creation therefore runs in an ephemeral plugin
 * fiber derived from the Principal Context and explicitly injecting `agents`.
 * DSH must carry that caller-bound derived context into the Agent factory as
 * ownerCtx, preserving Principal identity and tenant capability resolution.
 */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { DSH_TARGET_VERSION } from './dsh-target.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'dsh-mt-agent-owner-'))
const src = join(tmp, 'src')

try {
  mkdirSync(src)
  for (const name of ['runtime.ts', 'service.ts', 'store.ts', 'types.ts', 'errors.ts', 'validation.ts']) {
    copyFileSync(join(root, 'packages', 'multi-tenant', 'src', name), join(src, basename(name)))
  }

  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'agent-owner-probe', private: true, type: 'module' }))
  writeFileSync(join(tmp, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: false\n')

  try {
    execFileSync('pnpm', [
      'add',
      '@deepseek-ai/cordis@4.0.1',
      'tsx@4',
      `@deepseek-ai/dsh-agent@${DSH_TARGET_VERSION}`,
    ], {
      cwd: tmp,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new Error(
      `failed to install public DSH Agent contract at ${DSH_TARGET_VERSION}\n${String(error.stdout ?? '').trim()}\n${String(error.stderr ?? '').trim()}`,
      { cause: error },
    )
  }

  writeFileSync(join(tmp, 'probe.ts'), `
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { InMemoryTenantSessionStore } from './src/store.ts'
import { MultiTenantService } from './src/service.ts'
import { TenantRuntimeService, principalOf, tenantIdOf } from './src/runtime.ts'

const root = new Context()
await root.plugin(InMemoryTenantSessionStore)
await root.plugin(MultiTenantService)
await root.plugin(TenantRuntimeService)
await root.plugin(AgentRegistry)

const observed = []
root.agents.setFactory({
  async createAgent(ownerCtx, options) {
    observed.push({
      sessionId: options.sessionId,
      tenantId: tenantIdOf(ownerCtx),
      principal: principalOf(ownerCtx),
      capability: ownerCtx.get('tenantCapability'),
      ownerFiberName: ownerCtx.fiber.name,
    })

    const agentCtx = root.extend({})
    const commit = await options.setup?.(agentCtx)
    commit?.commit()
    return {
      agent: { id: options.sessionId, ctx: agentCtx, session: { id: options.sessionId } },
      async dispose() {},
    }
  },
  async resume() { throw new Error('resume is outside this proof') },
})

const acme = await root.tenantRuntime.tenants.ensure('acme', {
  isolateServices: ['tenantCapability'],
  setup: ({ ctx }) => { ctx.provide('tenantCapability', 'A') },
})
const globex = await root.tenantRuntime.tenants.ensure('globex', {
  isolateServices: ['tenantCapability'],
  setup: ({ ctx }) => { ctx.provide('tenantCapability', 'B') },
})
const alice = await acme.principals.ensure('alice')
const bob = await globex.principals.ensure('bob')

async function createFromPrincipal(principalScope, sessionId) {
  let handle
  let projected
  const ownerFiber = principalScope.ctx.inject(['agents'], async (ownerCtx) => {
    handle = await ownerCtx.agents.create({
      sessionId,
      setup(agentCtx) {
        // Projection is explicit. The source value is resolved through the
        // Principal-derived owner context, not through a root/global registry.
        agentCtx.provide('projectedCapability', ownerCtx.get('tenantCapability'))
        projected = agentCtx.get('projectedCapability')
      },
    })
  })
  await ownerFiber
  if (handle === undefined) throw new Error('agent handle was not created')
  return { handle, ownerFiber, projected }
}

const agentA = await createFromPrincipal(alice, 'agent-a')
const agentB = await createFromPrincipal(bob, 'agent-b')

const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAILED: ' + msg) }
assert(observed.length === 2, 'factory must receive both creates')
assert(observed[0].tenantId === 'acme' && observed[0].principal?.userId === 'alice', 'Agent A owner context must derive from Alice principal')
assert(observed[1].tenantId === 'globex' && observed[1].principal?.userId === 'bob', 'Agent B owner context must derive from Bob principal')
assert(observed[0].capability === 'A' && observed[1].capability === 'B', 'owner context capability graph must stay tenant-specific')
assert(agentA.projected === 'A' && agentB.projected === 'B', 'Agent setup must compose from the correct principal runtime')

await agentA.handle.dispose()
await agentB.handle.dispose()
await agentA.ownerFiber.dispose()
await agentB.ownerFiber.dispose()
await acme.dispose()
await globex.dispose()

console.log(JSON.stringify({ observed, projectedA: agentA.projected, projectedB: agentB.projected }))
`)

  const out = execFileSync('pnpm', ['exec', 'tsx', 'probe.ts'], {
    cwd: tmp,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log(`Agent owner-context proof passed on DSH ${DSH_TARGET_VERSION}: ${out.trim()}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
