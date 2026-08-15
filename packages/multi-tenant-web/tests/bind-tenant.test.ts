import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  InMemoryTenantSessionStore,
  MultiTenantService,
  SessionAccessDeniedError,
} from 'dsh-multi-tenant'
import { bindTenant } from '../src/bind-tenant.ts'
import type { ApiSurface, MuxFrame, SessionSummary } from '../src/bind-tenant.ts'

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

function makeMockApi(): ApiSurface {
  const all: SessionSummary[] = [{ sessionId: 's1' }, { sessionId: 's2' }]
  return {
    sessions: {
      list: async () => ({ items: all }),
      history: async (req) => ({ historyOf: req.sessionId }),
    },
    events: {
      mux: async function* (): AsyncIterable<MuxFrame> {
        yield { type: 'session/event', sessionId: 's1' }
        yield { type: 'session/event', sessionId: 's2' }
        yield { type: 'stream/error' } // no sessionId → unclassifiable
      },
    },
    respond: async (msg) => ({ respondedTo: msg.sessionId }),
  }
}

async function collect(iterable: AsyncIterable<MuxFrame>): Promise<MuxFrame[]> {
  const frames: MuxFrame[] = []
  for await (const frame of iterable) frames.push(frame)
  return frames
}

describe('bindTenant facade', () => {
  it('1. filters session.list to the principal\'s own sessions', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeMockApi(), alice, multiTenant)
    const { items } = await facade.sessions.list()
    expect(items.map(item => item.sessionId)).toEqual(['s1'])
  })

  it('2. guards session.history for a foreign session', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeMockApi(), alice, multiTenant)
    await expect(facade.sessions.history({ sessionId: 's1' })).resolves.toEqual({ historyOf: 's1' })
    await expect(facade.sessions.history({ sessionId: 's2' })).rejects.toThrow(SessionAccessDeniedError)
  })

  it('3. filters events.mux frames by sessionId', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeMockApi(), alice, multiTenant)
    const frames = await collect(facade.events.mux())
    expect(frames.map(frame => frame.sessionId)).toEqual(['s1'])
  })

  it('4. guards respond for a foreign approval/question', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeMockApi(), alice, multiTenant)
    await expect(facade.respond({ sessionId: 's1' })).resolves.toEqual({ respondedTo: 's1' })
    await expect(facade.respond({ sessionId: 's2' })).rejects.toThrow(SessionAccessDeniedError)
  })

  it('5. does not cross-talk between concurrent tenants', async () => {
    const multiTenant = await makeMultiTenant()
    const api = makeMockApi()
    const aliceFacade = bindTenant(api, alice, multiTenant)
    const bobFacade = bindTenant(api, bob, multiTenant)
    const [aliceItems, bobItems] = await Promise.all([
      aliceFacade.sessions.list().then(r => r.items),
      bobFacade.sessions.list().then(r => r.items),
    ])
    expect(aliceItems.map(item => item.sessionId)).toEqual(['s1'])
    expect(bobItems.map(item => item.sessionId)).toEqual(['s2'])
  })

  it('6. denies (drops) an unclassifiable frame without a sessionId', async () => {
    const multiTenant = await makeMultiTenant()
    const facade = bindTenant(makeMockApi(), alice, multiTenant)
    const frames = await collect(facade.events.mux())
    expect(frames.some(frame => frame.type === 'stream/error')).toBe(false)
  })
})
