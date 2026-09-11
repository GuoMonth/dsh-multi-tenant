import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SessionAlreadyOwnedError } from '@deepseek-ai/dsh-session-persistence'
import { describe, expect, it } from 'vitest'
import { TestModel } from './fixtures/model.ts'
import {
  AgentNotFoundError,
  AgentProvisioningError,
  CapabilityUnavailableError,
  createPrincipalContext,
  RuntimePartitionProvider,
} from '../src/index.ts'
import type { AgentId, PrincipalContext } from '../src/types.ts'

import { openRuntime } from './fixtures/runtime.ts'

async function identity(ctx: Context, principal: PrincipalContext, id: AgentId): Promise<unknown> {
  const result: any = await ctx.multiTenant.executeTool(principal, id, 'mcp__shared__identity', {})
  expect(result.isError).toBe(false)
  const responseText = result.value?.content?.find((block: any) => block.type === 'text')?.text
  if (typeof responseText !== 'string') throw new Error('MCP identity tool returned no text')
  return JSON.parse(responseText)
}

async function injectMarker(ctx: Context, principal: PrincipalContext, id: AgentId, marker: string): Promise<void> {
  await ctx.multiTenant.inject(principal, id, createUserMessage({
    content: [{ type: 'text', text: marker }],
    source: { kind: 'plugin', plugin: 'dsh-multi-tenant-test' },
  }))
  await ctx.multiTenant.whenIdle(principal, id)
}

/** Observe durable state, rather than treating Agent idleness as a write barrier. */
async function readStored(ctx: Context, id: ReturnType<typeof SessionId>) {
  await ctx.sessionPersistence.flush()
  const handle = await ctx.sessionPersistence.open(id, 'read')
  try {
    expect(handle.header.version).toBe(3)
    return await handle.read()
  } finally {
    await handle.close()
  }
}

describe('DSH 0.1.5-rc.2 native Agent/Session/MCP lifecycle', () => {
  it('reads persisted history after restart without activating an Agent or loading runtime capabilities', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-read-'))
    const database = join(directory, 'agents.sqlite')
    const sessions = join(directory, 'sessions')
    let ctx = await openRuntime(database, sessions)
    const owner = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
    try {
      ctx.llm.registerAdapter(['test'], new TestModel())
      const resource = await ctx.multiTenant.create(owner, { agentOptions: { provider: 'test', model: 'test' } })
      const observation = await ctx.multiTenant.observe(owner, resource.id)
      const frames: unknown[] = []
      const consuming = (async () => { for await (const frame of observation) frames.push(frame) })()
      await ctx.multiTenant.send(owner, resource.id, 'private question')
      await ctx.multiTenant.whenIdle(owner, resource.id)
      await expect.poll(() => JSON.stringify(frames)).toContain('test response')
      await observation.dispose()
      await consuming
      const livePage = await ctx.multiTenant.read(owner, resource.id)
      expect(livePage.items.filter(item => item.kind === 'assistant')).toHaveLength(1)
      await ctx.fiber.dispose()
      ctx = await openRuntime(database, sessions)
      ctx.tenantMcp.load = async () => { throw new Error('must not acquire MCP while reading') }
      ctx.multiTenantSecrets.acquire = async () => { throw new Error('must not acquire Secrets while reading') }
      ctx.runtimePartitions.acquire = async () => { throw new Error('must not activate a partition') }
      const page = await ctx.multiTenant.read(owner, resource.id)
      expect(page.items).toEqual(livePage.items)
      expect(page.active).toBe(false)
      const tail = await ctx.multiTenant.read(owner, resource.id, { limit: 1 })
      expect(tail.older).toBeDefined()
      const older = await ctx.multiTenant.read(owner, resource.id, { before: tail.older! })
      expect(older.items.every(item => item.seq < tail.items[0]!.seq)).toBe(true)
      const record = await ctx.tenantAgentRepository.get(owner, resource.id)
      expect(ctx.agents.get(SessionId(record!.sessionId))).toBeUndefined()
      expect(ctx.sessions.get(SessionId(record!.sessionId))).toBeUndefined()
      const outsider = createPrincipalContext({ tenantId: 'acme', principalId: 'bob' })
      const openRead = ctx.runtimePartitions.openRead.bind(ctx.runtimePartitions)
      ctx.runtimePartitions.openRead = async () => { throw new Error('unauthorized read reached provider') }
      await expect(ctx.multiTenant.read(outsider, resource.id)).rejects.toBeInstanceOf(AgentNotFoundError)
      ctx.runtimePartitions.openRead = openRead
      const stream = await ctx.multiTenant.observe(owner, resource.id)
      const iterator = stream[Symbol.asyncIterator]()
      expect((await iterator.next()).value?.type).toBe('replace')
      const pending = iterator.next()
      const rejected = expect(pending).rejects.toBeInstanceOf(CapabilityUnavailableError)
      await ctx.multiTenant.delete(owner, resource.id)
      await rejected
      await expect(ctx.multiTenant.read(owner, resource.id)).rejects.toBeInstanceOf(AgentNotFoundError)
    } finally { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) }
  })
  it('accepts sends and stops a real model call without waiting for its turn', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-controls-'))
    const ctx = await openRuntime(join(directory, 'agents.sqlite'), join(directory, 'sessions'))
    const model = new TestModel()
    model.before = options => new Promise((_, reject) => {
      if (options.signal?.aborted) reject(options.signal.reason)
      else options.signal?.addEventListener('abort', () => reject(options.signal!.reason), { once: true })
    })
    ctx.llm.registerAdapter(['controlled'], model)
    try {
      const owner = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
      const resource = await ctx.multiTenant.create(owner, { agentOptions: { provider: 'controlled', model: 'test' } })
      await expect(ctx.multiTenant.send(owner, resource.id, 'start')).resolves.toEqual({ accepted: true })
      await model.entered.promise
      await expect(ctx.multiTenant.send(owner, resource.id, 'steer', { delivery: 'steer' })).resolves.toEqual({ accepted: true })
      await expect(ctx.multiTenant.cancel(owner, resource.id)).resolves.toEqual({ status: 'cancelled' })
      await ctx.multiTenant.whenIdle(owner, resource.id)
      const record = await ctx.tenantAgentRepository.get(owner, resource.id)
      const stored = await readStored(ctx, SessionId(record!.sessionId))
      expect(stored.events.some(event => event.type === 'turn/end')).toBe(true)
    } finally {
      await ctx.fiber.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('refuses to publish a shared Agent without a durability checkpoint', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-no-persistence-'))
    let ctx: Context | undefined
    try {
      ctx = await openRuntime(join(directory, 'agents.sqlite'), join(directory, 'sessions'), false)
      const principal = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
      await expect(ctx.multiTenant.create(principal)).rejects.toThrow(CapabilityUnavailableError)
      expect(await ctx.multiTenant.list(principal)).toEqual([])
      const records = await ctx.tenantAgentRepository.list(principal)
      expect(records).toHaveLength(1)
      expect(records[0]?.state).toBe('failed')
      expect(ctx.agents.get(SessionId(records[0]!.sessionId))).toBeUndefined()
    } finally {
      if (ctx !== undefined) await ctx.fiber.dispose().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  }, 60_000)

  it('fails publication and releases the writer and MCP scope when a checkpoint fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-flush-failure-'))
    let ctx: Context | undefined
    try {
      ctx = await openRuntime(join(directory, 'agents.sqlite'), join(directory, 'sessions'))
      const principal = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
      const removeFailure = ctx.on('session/flush', () => { throw new Error('checkpoint failed') })
      try {
        await expect(ctx.multiTenant.create(principal)).rejects.toThrow(AgentProvisioningError)
      } finally {
        removeFailure()
      }
      expect(await ctx.multiTenant.list(principal)).toEqual([])
      const records = await ctx.tenantAgentRepository.list(principal)
      expect(records).toHaveLength(1)
      expect(records[0]?.state).toBe('failed')
      const id = SessionId(records[0]!.sessionId)
      expect(ctx.agents.get(id)).toBeUndefined()
      // The official backend did flush before the other listener failed;
      // acquisition here proves that cleanup released the native writer.
      const writer = await ctx.sessionPersistence.open(id, 'write')
      await writer.close()
      const retried = await ctx.multiTenant.create(principal)
      await expect(identity(ctx, principal, retried.id)).resolves.toEqual({
        tenant: 'acme', principal: 'alice', credentialAccepted: true,
      })
    } finally {
      if (ctx !== undefined) await ctx.fiber.dispose().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  }, 60_000)

  it('can resume a published Agent after restart before its first message', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-empty-'))
    const database = join(directory, 'agents.sqlite')
    const sessions = join(directory, 'sessions')
    let first: Context | undefined
    let second: Context | undefined
    try {
      first = await openRuntime(database, sessions)
      const principal = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
      const agent = await first.multiTenant.create(principal, {
        agentOptions: { provider: 'test-provider', model: 'test-model', reasoningEffort: 'medium', maxTokens: 128 },
      })
      const record = await first.tenantAgentRepository.get(principal, agent.id)
      if (record === undefined) throw new Error('Agent Directory lost a ready record')
      expect(first.agents.get(SessionId(record.sessionId))?.options.reasoningEffort).toBe('medium')
      // No message, persistence read, or caller-owned flush before shutdown.
      await first.fiber.dispose()
      first = undefined
      second = await openRuntime(database, sessions)
      await expect(identity(second, principal, agent.id)).resolves.toEqual({
        tenant: 'acme', principal: 'alice', credentialAccepted: true,
      })
    } finally {
      if (first !== undefined) await first.fiber.dispose().catch(() => undefined)
      if (second !== undefined) await second.fiber.dispose().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  }, 60_000)

  it('creates, persists, restarts, resumes, and deletes real DSH Agents', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-v3-'))
    const database = join(directory, 'agents.sqlite')
    const sessions = join(directory, 'sessions')
    let first: Context | undefined
    let second: Context | undefined
    try {
      first = await openRuntime(database, sessions)
      expect(first.runtimePartitions).toBeInstanceOf(RuntimePartitionProvider)
      const alice = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
      const bob = createPrincipalContext({ tenantId: 'acme', principalId: 'bob' })
      const [aliceAgent, bobAgent] = await Promise.all([
        first.multiTenant.create(alice),
        first.multiTenant.create(bob),
      ])
      expect(aliceAgent.mcpServers).toEqual(['shared'])
      expect(bobAgent.mcpServers).toEqual(['shared'])
      expect(JSON.stringify([aliceAgent, bobAgent])).not.toMatch(/session|secret|tenantId|principalId/i)

      const aliceRecord = await first.tenantAgentRepository.get(alice, aliceAgent.id)
      const bobRecord = await first.tenantAgentRepository.get(bob, bobAgent.id)
      if (aliceRecord === undefined || bobRecord === undefined) throw new Error('Agent Directory lost a ready record')
      expect(first.agents.get(SessionId(aliceRecord.sessionId))).toBeDefined()
      expect(first.agents.get(SessionId(bobRecord.sessionId))).toBeDefined()

      await expect(identity(first, alice, aliceAgent.id)).resolves.toEqual({
        tenant: 'acme', principal: 'alice', credentialAccepted: true,
      })
      await expect(identity(first, bob, bobAgent.id)).resolves.toEqual({
        tenant: 'acme', principal: 'bob', credentialAccepted: true,
      })
      await injectMarker(first, alice, aliceAgent.id, 'alice survives restart')
      await injectMarker(first, bob, bobAgent.id, 'bob survives restart')

      const aliceStored = await readStored(first, SessionId(aliceRecord.sessionId))
      const bobStored = await readStored(first, SessionId(bobRecord.sessionId))
      expect(JSON.stringify(aliceStored.events)).toContain('alice survives restart')
      expect(JSON.stringify(bobStored.events)).toContain('bob survives restart')

      await first.fiber.dispose()
      first = undefined

      second = await openRuntime(database, sessions)
      const restartedAlice = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
      const restartedBob = createPrincipalContext({ tenantId: 'acme', principalId: 'bob' })
      const globexAlice = createPrincipalContext({ tenantId: 'globex', principalId: 'alice' })

      await expect(second.multiTenant.executeTool(restartedBob, aliceAgent.id, 'probe', {}))
        .rejects.toThrow(AgentNotFoundError)
      await expect(second.multiTenant.executeTool(globexAlice, aliceAgent.id, 'probe', {}))
        .rejects.toThrow(AgentNotFoundError)
      expect(second.agents.get(SessionId(aliceRecord.sessionId))).toBeUndefined()

      const reopened = await second.multiTenant.get(restartedAlice, aliceAgent.id)
      expect(JSON.stringify(reopened)).not.toContain(aliceRecord.sessionId)
      await expect(identity(second, restartedAlice, aliceAgent.id)).resolves.toEqual({
        tenant: 'acme', principal: 'alice', credentialAccepted: true,
      })
      const resumed = second.agents.get(SessionId(aliceRecord.sessionId))
      expect(resumed?.id).toBe(SessionId(aliceRecord.sessionId))
      expect(JSON.stringify(resumed?.session.snapshotEvents())).toContain('alice survives restart')

      await second.multiTenant.delete(restartedAlice, aliceAgent.id)
      await expect(second.multiTenant.get(restartedAlice, aliceAgent.id)).rejects.toThrow(AgentNotFoundError)
      expect(second.agents.get(SessionId(aliceRecord.sessionId))).toBeUndefined()
      const retainedLog = await readStored(second, SessionId(aliceRecord.sessionId))
      expect(JSON.stringify(retainedLog.events)).toContain('alice survives restart')
    } finally {
      if (first !== undefined) await first.fiber.dispose().catch(() => undefined)
      if (second !== undefined) await second.fiber.dispose().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  }, 60_000)

  it('allows durable readers but refuses another writer until Agent disposal releases ownership', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-writer-'))
    let first: Context | undefined
    let second: Context | undefined
    try {
      const sessions = join(directory, 'sessions')
      first = await openRuntime(join(directory, 'first.sqlite'), sessions)
      second = await openRuntime(join(directory, 'second.sqlite'), sessions)
      const principal = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
      const resource = await first.multiTenant.create(principal)
      const record = await first.tenantAgentRepository.get(principal, resource.id)
      if (record === undefined) throw new Error('Agent Directory lost a ready record')
      const id = SessionId(record.sessionId)
      await injectMarker(first, principal, resource.id, 'writer handoff retains history')
      await first.sessionPersistence.flush()

      // A different backend instance can read a flushed prefix without owning the writer.
      const reader = await second.sessionPersistence.open(id, 'read')
      try {
        expect(JSON.stringify((await reader.read()).events)).toContain('writer handoff retains history')
        await expect(second.agents.resume({ resumeSessionId: id })).rejects.toThrow(SessionAlreadyOwnedError)
        expect(second.agents.get(id)).toBeUndefined()
        expect(first.agents.get(id)).toBeDefined()
      } finally {
        await reader.close()
      }

      await first.fiber.dispose()
      first = undefined
      const resumed = await second.agents.resume({ resumeSessionId: id })
      try {
        expect(resumed.agent.session.header.version).toBe(3)
        expect(JSON.stringify(resumed.agent.session.snapshotEvents())).toContain('writer handoff retains history')
      } finally {
        await resumed.dispose()
      }
    } finally {
      if (first !== undefined) await first.fiber.dispose().catch(() => undefined)
      if (second !== undefined) await second.fiber.dispose().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  }, 60_000)
})

it('repeated MCP discovery cursor fails provisioning and releases Agent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-rc2-cursor-'))
  const ctx = await openRuntime(join(directory, 'agents.sqlite'), join(directory, 'sessions'))
  const principal = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
  ctx.tenantMcp.load = async () => ({
    revision: 'repeated-cursor',
    servers: [{
      transport: 'stdio', serverName: 'cursor', command: process.execPath,
      args: [fileURLToPath(new URL('./fixtures/repeated-cursor.mjs', import.meta.url))],
      reconnect: { enabled: false }, toolCallTimeoutMs: 1000,
    }],
  })
  try {
    await expect(ctx.multiTenant.create(principal)).rejects.toThrow(AgentProvisioningError)
    expect(await ctx.multiTenant.list(principal)).toEqual([])
    const records = await ctx.tenantAgentRepository.list(principal)
    expect(records).toHaveLength(1)
    expect(records[0]!.state).toBe('failed')
    expect(ctx.agents.get(SessionId(records[0]!.sessionId))).toBeUndefined()
  } finally {
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}, 5000)
