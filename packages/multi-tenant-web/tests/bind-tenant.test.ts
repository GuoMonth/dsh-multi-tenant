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

const alice = { tenantId: 'acme', userId: 'alice' }
const bob = { tenantId: 'acme', userId: 'bob' }

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
      create: async (req: any) => ok(req.rpcId, { sessionId: 'new' }),
      history: async (req: any) => ok(req.rpcId, { historyOf: req.payload.sessionId }),
    },
    subagents: {
      list: async (req: any) => ok(req.rpcId, { entries: [], parentAvailable: true }),
    },
    host: {
      describe: async (req: any) => ok(req.rpcId, {}),
    },
    settings: {
      describe: async (req: any) => ok(req.rpcId, {}),
    },
    credentials: {
      set: async (req: any) => ok(req.rpcId, {}),
    },
    llm: {
      models: async (req: any) => ok(req.rpcId, {}),
    },
    agentPresets: {
      list: async (req: any) => ok(req.rpcId, { presets: [] }),
      read: async (req: any) => ok(req.rpcId, {}),
    },
    respond: async () => ({ accepted: true }),
  } as unknown as ApiProxy
}

describe('CLASSIFICATION (exhaustive — compile-time guaranteed by Record<keyof RpcMethodMap, …>)', () => {
  it('guards session-keyed methods and only post-filters safe collections', () => {
    expect(CLASSIFICATION['session.history']).toBe('guard')
    expect(CLASSIFICATION['session.list']).toBe('filter')
    expect(CLASSIFICATION['session.search']).toBe('deny')
    expect(CLASSIFICATION['goal.create']).toBe('guard')
    expect(CLASSIFICATION['skill.list']).toBe('guard')
    expect(CLASSIFICATION['agentPreset.select']).toBe('guard')
    expect(CLASSIFICATION['subagent.list']).toBe('guard')
  })

  it('treats session.create as admission, not ordinary allow', () => {
    expect(CLASSIFICATION['session.create']).toBe('admit')
  })

  it('denies deployment-management surfaces by default', () => {
    expect(CLASSIFICATION['host.describe']).toBe('deny')
    expect(CLASSIFICATION['workspace.list']).toBe('deny')
    expect(CLASSIFICATION['settings.describe']).toBe('deny')
    expect(CLASSIFICATION['credentials.set']).toBe('deny')
    expect(CLASSIFICATION['llm.models']).toBe('deny')
    expect(CLASSIFICATION['agentPreset.read']).toBe('deny')
    expect(CLASSIFICATION['agentPreset.list']).toBe('allow')
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

  it('denies search until tenant-scoped query semantics exist', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeStubApi(), alice, multiTenant)
    await expect((facade.sessions as any).search({ rpcId: 'r', payload: { query: 'x' } })).rejects.toThrow(SessionAccessDeniedError)
  })

  it('denies session.create until the admission bridge is installed', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeStubApi(), alice, multiTenant)
    await expect((facade.sessions as any).create({ rpcId: 'r', payload: {} })).rejects.toThrow(SessionAccessDeniedError)
  })

  it('denies deployment-management methods', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeStubApi(), alice, multiTenant)
    await expect((facade.settings as any).describe({ rpcId: 'r', payload: {} })).rejects.toThrow(SessionAccessDeniedError)
    await expect((facade.credentials as any).set({ rpcId: 'r', payload: { ref: 'x', value: 'secret' } })).rejects.toThrow(SessionAccessDeniedError)
    await expect((facade.llm as any).models({ rpcId: 'r', payload: {} })).rejects.toThrow(SessionAccessDeniedError)
    await expect((facade.agentPresets as any).read({ rpcId: 'r', payload: { agentPreset: 'p' } })).rejects.toThrow(SessionAccessDeniedError)
  })

  it('allows explicitly tenant-neutral picker discovery', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeStubApi(), alice, multiTenant)
    await expect((facade.agentPresets as any).list({ rpcId: 'r', payload: {} })).resolves.toBeDefined()
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
