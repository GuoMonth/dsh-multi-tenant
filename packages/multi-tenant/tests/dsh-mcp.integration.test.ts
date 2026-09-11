import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionAlreadyOwnedError } from '@deepseek-ai/dsh-session-persistence'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import {
  AgentNotFoundError,
  AgentProvisioningError,
  CapabilityUnavailableError,
  createPrincipalContext,
  MultiTenantService,
  RuntimePartitionProvider,
  SecretProvider,
  SharedDshRuntimePartitionProvider,
  TenantMcpProvider,
} from '../src/index.ts'
import type { TenantMcpSnapshot } from '../src/mcp.ts'
import type { SecretLease } from '../src/protocols.ts'
import { SQLiteTenantAgentRepository } from '../src/sqlite.ts'
import type { AgentId, PrincipalContext } from '../src/types.ts'

const fixture = fileURLToPath(new URL('./fixtures/mcp-server.mjs', import.meta.url))

class PrincipalMcpProvider extends TenantMcpProvider {
  override async load(principal: PrincipalContext, signal: AbortSignal): Promise<TenantMcpSnapshot> {
    signal.throwIfAborted()
    return {
      revision: 'fixture-v1',
      servers: [{
        transport: 'stdio',
        serverName: 'shared',
        command: process.execPath,
        args: [fixture],
        env: {
          TENANT_ID: principal.tenantId,
          PRINCIPAL_ID: principal.principalId,
        },
        secretEnv: { API_TOKEN: { secret: 'api-token', prefix: 'token:' } },
        reconnect: { enabled: false },
        toolCallTimeoutMs: 5_000,
      }],
    }
  }
}

class PrincipalSecretProvider extends SecretProvider {
  override async acquire(
    principal: PrincipalContext,
    _names: readonly string[],
    signal: AbortSignal,
  ): Promise<SecretLease> {
    signal.throwIfAborted()
    return {
      revision: `secret:${principal.tenantId}:${principal.principalId}`,
      values: { 'api-token': `${principal.tenantId}/${principal.principalId}` },
      signal: new AbortController().signal,
      dispose() {},
    }
  }
}

async function openRuntime(database: string, sessions: string, persistence = true): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  if (persistence) await ctx.plugin(JsonlSessionPersistence, { root: sessions, compression: 'none' })
  await ctx.plugin(SQLiteTenantAgentRepository, { path: database })
  await ctx.plugin(PrincipalMcpProvider)
  await ctx.plugin(PrincipalSecretProvider)
  await ctx.plugin(SharedDshRuntimePartitionProvider)
  await ctx.plugin(MultiTenantService)
  return ctx
}

async function identity(ctx: Context, principal: PrincipalContext, id: AgentId): Promise<unknown> {
  return ctx.multiTenant.withAgent(principal, id, async runtime => {
    const result: any = await runtime.executeTool('mcp__shared__identity', {})
    expect(result.isError).toBe(false)
    const responseText = result.value?.content?.find((block: any) => block.type === 'text')?.text
    if (typeof responseText !== 'string') throw new Error('MCP identity tool returned no text')
    return JSON.parse(responseText)
  })
}

async function injectMarker(ctx: Context, principal: PrincipalContext, id: AgentId, marker: string): Promise<void> {
  await ctx.multiTenant.withAgent(principal, id, async runtime => {
    runtime.inject(createUserMessage({
      content: [{ type: 'text', text: marker }],
      source: { kind: 'plugin', plugin: 'dsh-multi-tenant-test' },
    }))
    await runtime.whenIdle()
  })
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

      await expect(second.multiTenant.withAgent(restartedBob, aliceAgent.id, async () => undefined))
        .rejects.toThrow(AgentNotFoundError)
      await expect(second.multiTenant.withAgent(globexAlice, aliceAgent.id, async () => undefined))
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
