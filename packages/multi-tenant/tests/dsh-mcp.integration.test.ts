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
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import {
  AgentNotFoundError,
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

async function openRuntime(database: string, sessions: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(JsonlSessionPersistence, { root: sessions, compression: 'none' })
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

describe('DSH alpha.5 native Agent/Session/MCP lifecycle', () => {
  it('creates, persists, restarts, resumes, and deletes real DSH Agents', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-alpha5-'))
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

      const aliceStored = await first.sessionPersistence.load(SessionId(aliceRecord.sessionId))
      const bobStored = await first.sessionPersistence.load(SessionId(bobRecord.sessionId))
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
      const retainedLog = await second.sessionPersistence.load(SessionId(aliceRecord.sessionId))
      expect(JSON.stringify(retainedLog.events)).toContain('alice survives restart')
    } finally {
      if (first !== undefined) await first.fiber.dispose().catch(() => undefined)
      if (second !== undefined) await second.fiber.dispose().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  }, 60_000)
})
