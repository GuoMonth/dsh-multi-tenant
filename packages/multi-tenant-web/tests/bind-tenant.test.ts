import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  InMemoryTenantSessionStore,
  MultiTenantService,
  SessionAccessDeniedError,
} from 'dsh-multi-tenant'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import { bindTenant } from '../src/bind-tenant.ts'
import { CLASSIFICATION } from '../src/classification.ts'

const alice = { tenantId: 'acme', userId: 'alice', roles: ['member'] }
const bob = { tenantId: 'acme', userId: 'bob', roles: ['member'] }

async function makeMultiTenant(): Promise<MultiTenantService> {
  const ctx = new Context()
  await ctx.plugin(InMemoryTenantSessionStore)
  await ctx.plugin(MultiTenantService)
  await ctx.multiTenant.claimSession('s1', alice)
  await ctx.multiTenant.claimSession('s2', bob)
  return ctx.multiTenant
}

function makeStubApi(): ApiProxy {
  const ok = (rpcId: string, value: unknown) => ({ rpcId, result: { ok: true, value } })
  return {
    sessions: {
      list: async (req: any) => ok(req.rpcId, { items: [{ sessionId: 's1' }, { sessionId: 's2' }] }),
      search: async (req: any) => ok(req.rpcId, { items: [{ sessionId: 's1' }, { sessionId: 's2' }], hasMore: false }),
      history: async (req: any) => ok(req.rpcId, { historyOf: req.payload.sessionId }),
    },
    subagents: {
      list: async (req: any) => ok(req.rpcId, { entries: [], parentAvailable: true }),
    },
    host: {
      describe: async (req: any) => ok(req.rpcId, {}),
    },
    llm: {
      models: async (req: any) => ok(req.rpcId, {}),
    },
    respond: async () => ({ accepted: true }),
  } as unknown as ApiProxy
}

describe('CLASSIFICATION (exhaustive — compile-time guaranteed by Record<keyof RpcMethodMap, …>)', () => {
  it('maps session-keyed methods to guard, collections to filter', () => {
    expect(CLASSIFICATION['session.history']).toBe('guard')
    expect(CLASSIFICATION['session.list']).toBe('filter')
    expect(CLASSIFICATION['session.search']).toBe('filter')
    expect(CLASSIFICATION['goal.create']).toBe('guard')
    expect(CLASSIFICATION['skill.list']).toBe('guard')
    expect(CLASSIFICATION['agentPreset.select']).toBe('guard')
    expect(CLASSIFICATION['subagent.list']).toBe('guard')
  })

  it('maps create/global-config to allow, host/workspace to deny', () => {
    expect(CLASSIFICATION['session.create']).toBe('allow')
    expect(CLASSIFICATION['llm.models']).toBe('allow')
    expect(CLASSIFICATION['settings.describe']).toBe('allow')
    expect(CLASSIFICATION['credentials.set']).toBe('allow')
    expect(CLASSIFICATION['host.describe']).toBe('deny')
    expect(CLASSIFICATION['workspace.list']).toBe('deny')
  })
})

describe('bindTenant facade (real ApiProxy)', () => {
  it('guards a point method: own session passes, foreign session denies', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeStubApi(), alice, multiTenant)
    await expect((facade.sessions as any).history({ rpcId: 'r', payload: { sessionId: 's1' } })).resolves.toBeDefined()
    await expect((facade.sessions as any).history({ rpcId: 'r', payload: { sessionId: 's2' } })).rejects.toThrow(SessionAccessDeniedError)
  })

  it('filters session.list to the principal\'s own sessions', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeStubApi(), alice, multiTenant)
    const res: any = await (facade.sessions as any).list({ rpcId: 'r', payload: {} })
    expect(res.result.value.items.map((item: any) => item.sessionId)).toEqual(['s1'])
  })

  it('denies host-global methods', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeStubApi(), alice, multiTenant)
    await expect((facade.host as any).describe({ rpcId: 'r', payload: {} })).rejects.toThrow(SessionAccessDeniedError)
  })

  it('allows global-config methods through unchanged', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeStubApi(), alice, multiTenant)
    await expect((facade.llm as any).models({ rpcId: 'r', payload: {} })).resolves.toBeDefined()
  })

  it('guards subagent methods on the parent session', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeStubApi(), alice, multiTenant)
    await expect((facade.subagents as any).list({ rpcId: 'r', payload: { parentSessionId: 's1' } })).resolves.toBeDefined()
    await expect((facade.subagents as any).list({ rpcId: 'r', payload: { parentSessionId: 's2' } })).rejects.toThrow(SessionAccessDeniedError)
  })

  it('denies non-unary surfaces (respond / events)', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeStubApi(), alice, multiTenant)
    await expect((facade as any).respond({ type: 'client-response', rpcId: 'r', result: { ok: true, value: {} } })).rejects.toThrow(SessionAccessDeniedError)
    await expect((facade as any).events.mux()).rejects.toThrow(SessionAccessDeniedError)
  })
})
