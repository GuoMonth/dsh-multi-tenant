import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'
import { AgentNotFoundError, CapabilityUnavailableError, createPrincipalContext } from '../src/index.ts'
import { openRuntime, PrincipalSecretProvider } from './fixtures/runtime.ts'
import { TestModel } from './fixtures/model.ts'

it('uses native catalog/continuations under root authority and propagates MCP scope through real children', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-children-'))
  const database = join(directory, 'agents.sqlite')
  const sessions = join(directory, 'sessions')
  let ctx = await openRuntime(database, sessions, true, true)
  const owner = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
  const bob = createPrincipalContext({ tenantId: 'acme', principalId: 'bob' })
  const outsider = createPrincipalContext({ tenantId: 'other', principalId: 'alice' })
  try {
    const gate = Promise.withResolvers<void>()
    const initialModel = new TestModel()
    initialModel.before = options => Promise.race([gate.promise, new Promise<void>(resolve => options.signal!.addEventListener('abort', () => resolve(), { once: true }))])
    ctx.llm.registerAdapter(['test'], initialModel)
    const root = await ctx.multiTenant.create(owner, { agentOptions: { provider: 'test', model: 'test' } })
    const other = await ctx.multiTenant.create(bob, { agentOptions: { provider: 'test', model: 'test' } })
    const record = await ctx.tenantAgentRepository.get(owner, root.id)
    const otherRecord = await ctx.tenantAgentRepository.get(bob, other.id)
    const parent = ctx.agents.get(SessionId(record!.sessionId))!
    const sibling = ctx.agents.get(SessionId(otherRecord!.sessionId))!
    const start = async (agent: typeof parent, label: string) => ctx.subagents.startContinuable({ provider: 'spawn', label, request: { parent: agent, prompt: [{ type: 'text', text: 'work' }] }, signal: new AbortController().signal })
    const aliceChild = await start(parent, 'Alice worker')
    const bobChild = await start(sibling, 'Bob worker')
    const nativeChild = ctx.agents.get(aliceChild.childId)!

    const identity = async (id: typeof aliceChild.childId) => {
      const result: any = await ctx.tools.execute({ callId: ToolCallId('identity-test'), name: 'mcp__shared__identity', arguments: {}, agent: ctx.agents.get(id)!, signal: new AbortController().signal })
      expect(result.isError).toBe(false)
      return JSON.parse(result.value.content[0].text)
    }
    expect(await identity(aliceChild.childId)).toMatchObject({ principal: 'alice', credentialAccepted: true })
    expect(await identity(bobChild.childId)).toMatchObject({ principal: 'bob', credentialAccepted: true })
    gate.resolve()
    await nativeChild.whenIdle()
    await ctx.agents.get(bobChild.childId)?.whenIdle()
    const children = await ctx.multiTenant.children(owner, root.id)
    expect(children).toHaveLength(1)
    const ref = children[0]!.ref
    expect(JSON.stringify(children)).not.toContain(aliceChild.childId)
    expect((await ctx.multiTenant.read(owner, root.id)).children).toEqual(children)
    for (const principal of [bob, outsider]) {
      await expect(ctx.multiTenant.children(principal, root.id)).rejects.toBeInstanceOf(AgentNotFoundError)
      await expect(ctx.multiTenant.read(principal, root.id, { childRef: ref })).rejects.toBeInstanceOf(AgentNotFoundError)
      await expect(ctx.multiTenant.send(principal, root.id, 'forged', { childRef: ref })).rejects.toBeInstanceOf(AgentNotFoundError)
      await expect(ctx.multiTenant.cancel(principal, root.id, undefined, { childRef: ref })).rejects.toBeInstanceOf(AgentNotFoundError)
    }
    await expect(ctx.multiTenant.read(bob, other.id, { childRef: ref })).rejects.toBeInstanceOf(AgentNotFoundError)
    await expect(ctx.multiTenant.read(owner, root.id, { childRef: `${root.id}.999` })).rejects.toBeInstanceOf(AgentNotFoundError)
    // Real native one-shot fork: inherited parent catalog must not become its own children.
    const run = await ctx.subagents.start('fork', { parent, prompt: [{ type: 'text', text: 'one shot' }], signal: new AbortController().signal })
    await run.result
    await run.dispose()
    const oneShot = (await ctx.multiTenant.children(owner, root.id)).find(child => child.mode === 'one-shot')!
    expect(await ctx.multiTenant.children(owner, root.id, { childRef: oneShot.ref })).toEqual([])
    await expect(ctx.multiTenant.send(owner, root.id, 'cannot resume', { childRef: oneShot.ref })).rejects.toBeInstanceOf(CapabilityUnavailableError)
    // Drain through the actual continuation manager, then restore through the host delivery seam.
    await ctx.subagents.drainContinuableChildren(parent, [aliceChild.childId])
    expect(ctx.agents.get(aliceChild.childId)).toBeUndefined()
    await ctx.multiTenant.send(owner, root.id, 'cold follow-up', { childRef: ref })
    await ctx.agents.get(aliceChild.childId)?.whenIdle()
    expect((await ctx.multiTenant.read(owner, root.id, { childRef: ref })).items.some(item => item.text === 'cold follow-up')).toBe(true)
    const restrictionGate = Promise.withResolvers<void>()
    initialModel.before = options => Promise.race([restrictionGate.promise, new Promise<void>(resolve => options.signal!.addEventListener('abort', () => resolve(), { once: true }))])
    const restricted = await ctx.subagents.startContinuable({ provider: 'spawn', label: 'restricted', request: { parent, prompt: [{ type: 'text', text: 'limited' }], toolFilter: { allow: [] } }, signal: new AbortController().signal })
    const restrictedAgent = ctx.agents.get(restricted.childId)!
    expect(ctx.tools.get('mcp__shared__identity', restrictedAgent)).toBeUndefined()
    const refused = await ctx.tools.execute({ callId: ToolCallId('denied'), name: 'mcp__shared__identity', arguments: {}, agent: restrictedAgent, signal: new AbortController().signal })
    expect(refused.isError).toBe(true)
    expect(ctx.tools.get('mcp__shared__identity', parent)).toBeDefined()
    restrictionGate.resolve()
    await restrictedAgent.whenIdle()
    await ctx.fiber.dispose()
    ctx = await openRuntime(database, sessions, true, true)
    const restartedModel = new TestModel()
    ctx.llm.registerAdapter(['test'], restartedModel)
    expect((await ctx.multiTenant.children(owner, root.id))[0]?.ref).toBe(ref)
    await ctx.multiTenant.send(owner, root.id, 'after restart', { childRef: ref })
    await ctx.agents.get(aliceChild.childId)?.whenIdle()
    const held = new TestModel()
    held.before = options => new Promise((_, reject) => options.signal!.addEventListener('abort', () => reject(options.signal!.reason), { once: true }))
    restartedModel.before = options => { held.entered.resolve(); return held.before!(options) }
    await ctx.multiTenant.send(owner, root.id, 'hold', { childRef: ref })
    await held.entered.promise
    await ctx.multiTenant.send(owner, root.id, 'steer', { childRef: ref, delivery: 'steer' })
    await ctx.multiTenant.cancel(owner, root.id, undefined, { childRef: ref })
    await ctx.agents.get(aliceChild.childId)?.whenIdle()
    await ctx.multiTenant.send(owner, root.id, 'hold for revoke', { childRef: ref })
    expect(ctx.agents.get(aliceChild.childId)).toBeDefined()
    ;(ctx.multiTenantSecrets as PrincipalSecretProvider).revoke(owner)
    await expect.poll(() => ctx.agents.get(aliceChild.childId)).toBeUndefined()
    await expect(ctx.multiTenant.send(owner, root.id, 'revoked', { childRef: ref })).rejects.toBeInstanceOf(CapabilityUnavailableError)
    await ctx.multiTenant.delete(owner, root.id)
    expect(ctx.agents.get(aliceChild.childId)).toBeUndefined()
    await expect(ctx.multiTenant.read(owner, root.id, { childRef: ref })).rejects.toBeInstanceOf(AgentNotFoundError)
  } finally { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) }
})
