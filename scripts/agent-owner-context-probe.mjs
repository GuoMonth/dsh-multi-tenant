#!/usr/bin/env node
/**
 * DSH Agent owner-context proof.
 *
 * The multi-tenant runtime does not pretend that Agent.ctx directly inherits
 * Tenant/Principal Cordis service isolation. The public contract we need is
 * narrower and stronger: `principal.ctx.agents.create()` must carry that exact
 * caller-bound Principal Context into the Agent factory as ownerCtx, from which
 * Agent setup can explicitly compose/project runtime capabilities.
 *
 * The probe declares only the public packages it directly consumes. Their own
 * package manifests own the rest of the dependency graph; duplicating that
 * graph here would make this compatibility proof depend on DSH internals.
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
  // Mirror the repository's explicit pnpm 11 build-script policy. esbuild's
  // platform binary arrives through its optional dependency, so acknowledging
  // and denying its redundant postinstall is sufficient for this throwaway probe.
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
    const stdout = String(error.stdout ?? '').trim()
    const stderr = String(error.stderr ?? '').trim()
    throw new Error(
      `failed to install public DSH Agent contract at ${DSH_TARGET_VERSION}\n${stdout}\n${stderr}`,
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
    const record = {
      sessionId: options.sessionId,
      tenantId: tenantIdOf(ownerCtx),
      principal: principalOf(ownerCtx),
      capability: ownerCtx.get('tenantCapability'),
    }
    observed.push(record)

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

let projectedA
let projectedB
await alice.ctx.agents.create({
  sessionId: 'agent-a',
  setup(agentCtx) {
    agentCtx.provide('projectedCapability', alice.ctx.get('tenantCapability'))
    projectedA = agentCtx.get('projectedCapability')
  },
})
await bob.ctx.agents.create({
  sessionId: 'agent-b',
  setup(agentCtx) {
    agentCtx.provide('projectedCapability', bob.ctx.get('tenantCapability'))
    projectedB = agentCtx.get('projectedCapability')
  },
})

const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAILED: ' + msg) }
assert(observed.length === 2, 'factory must receive both creates')
assert(observed[0].tenantId === 'acme' && observed[0].principal?.userId === 'alice', 'Agent A ownerCtx must be Alice principal context')
assert(observed[1].tenantId === 'globex' && observed[1].principal?.userId === 'bob', 'Agent B ownerCtx must be Bob principal context')
assert(observed[0].capability === 'A' && observed[1].capability === 'B', 'ownerCtx capability graph must stay tenant-specific')
assert(projectedA === 'A' && projectedB === 'B', 'Agent setup must compose from the correct principal runtime')

console.log(JSON.stringify({ observed, projectedA, projectedB }))
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
