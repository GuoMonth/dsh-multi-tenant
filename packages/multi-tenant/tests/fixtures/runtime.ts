import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionQuerySqlite from '@deepseek-ai/dsh-session-query-sqlite'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as Fork from '@deepseek-ai/dsh-subagent-fork-in-process'
import { MultiTenantService, SecretProvider, SharedDshRuntimePartitionProvider, TenantMcpProvider } from '../../src/index.ts'
import type { SecretLease } from '../../src/protocols.ts'
import type { PrincipalContext } from '../../src/types.ts'
import type { TenantMcpSnapshot } from '../../src/mcp.ts'
import { SQLiteTenantAgentRepository } from '../../src/sqlite.ts'

const fixture = fileURLToPath(new URL('./mcp-server.mjs', import.meta.url))

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

export class PrincipalSecretProvider extends SecretProvider {
  readonly issued = new Map<string, AbortController[]>()
  readonly revoked = new Set<string>()
  revoke(principal: PrincipalContext) {
    const key = `${principal.tenantId}/${principal.principalId}`
    this.revoked.add(key)
    for (const controller of this.issued.get(key) ?? []) controller.abort(new Error('secret revoked'))
  }
  override async acquire(
    principal: PrincipalContext,
    _names: readonly string[],
    signal: AbortSignal,
  ): Promise<SecretLease> {
    signal.throwIfAborted()
    const key = `${principal.tenantId}/${principal.principalId}`
    const controller = new AbortController()
    this.issued.set(key, [...(this.issued.get(key) ?? []), controller])
    if (this.revoked.has(key)) controller.abort(new Error('secret revoked'))
    return {
      revision: `secret:${principal.tenantId}:${principal.principalId}`,
      values: { 'api-token': `${principal.tenantId}/${principal.principalId}` },
      signal: controller.signal,
      dispose() {},
    }
  }
}

export async function openRuntime(database: string, sessions: string, persistence = true, subagents = false, configure?: (ctx: Context) => Promise<void>): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  if (persistence) {
    await ctx.plugin(JsonlSessionPersistence, { root: sessions, compression: 'none' })
    await ctx.plugin(SessionQuerySqlite, { path: database + '.query' })
  }
  if (subagents) {
    await ctx.plugin(SubagentRuntime)
    await ctx.plugin(Spawn, { providerName: 'spawn' })
    await ctx.plugin(Fork, { providerName: 'fork' })
  }
  await ctx.plugin(SQLiteTenantAgentRepository, { path: database })
  await ctx.plugin(PrincipalMcpProvider)
  await ctx.plugin(PrincipalSecretProvider)
  await configure?.(ctx)
  if (!ctx.get('runtimePartitions')) await ctx.plugin(SharedDshRuntimePartitionProvider)
  await ctx.plugin(MultiTenantService)
  return ctx
}

