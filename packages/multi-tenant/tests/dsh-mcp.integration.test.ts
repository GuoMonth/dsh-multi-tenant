import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import {
  createPrincipalContext,
  InMemoryTenantAgentRepository,
  MultiTenantService,
  RuntimePartitionProvider,
  SecretProvider,
  SharedDshRuntimePartitionProvider,
  TenantMcpProvider,
} from '../src/index.ts'
import type { SecretLease } from '../src/protocols.ts'
import type { TenantMcpSnapshot } from '../src/mcp.ts'
import type { PrincipalContext } from '../src/types.ts'

const fixture = fileURLToPath(new URL('./fixtures/mcp-server.mjs', import.meta.url))

class PrincipalMcpProvider extends TenantMcpProvider {
  override async load(principal: PrincipalContext): Promise<TenantMcpSnapshot> {
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
  override async acquire(principal: PrincipalContext): Promise<SecretLease> {
    return {
      revision: `secret:${principal.tenantId}:${principal.principalId}`,
      values: { 'api-token': `${principal.tenantId}/${principal.principalId}` },
      signal: new AbortController().signal,
      dispose() {},
    }
  }
}

describe('DSH alpha.4 Agent/MCP integration', () => {
  it('runs the real MCP tool in independent Agent scopes with the same raw serverName', async () => {
    const root = new Context()
    const live = new Map<string, { agent: any; dispose(): Promise<void> }>()
    try {
      await root.plugin(SystemPrompt)
      await root.plugin(ToolRuntime)
      await root.plugin(AgentRegistry)

      root.agents.setFactory({
        async createAgent(ownerCtx, options) {
          const agent: any = {
            id: options.sessionId,
            options: {},
            session: { id: options.sessionId },
            status: 'idle',
            followup() {},
            steer() {},
            inject() {},
            cancel() {},
            async whenIdle() {},
          }
          const scope = createScope(root, agent)
          agent.ctx = scope.ctx.extend({ agent })
          let disposal: Promise<void> | undefined
          const handle = {
            agent,
            dispose(): Promise<void> {
              return disposal ??= (async () => {
                live.delete(agent.id)
                await scope.dispose()
              })()
            },
          }
          ownerCtx.effect(() => () => handle.dispose(), 'v04-integration Agent owner')
          try {
            const commit = await options.setup?.(agent.ctx)
            commit?.commit()
          } catch (error) {
            await handle.dispose()
            throw error
          }
          live.set(agent.id, handle)
          return handle
        },
        async resume(ownerCtx, options) {
          return this.createAgent(ownerCtx, {
            sessionId: options.resumeSessionId,
            ...(options.setup === undefined ? {} : { setup: options.setup }),
            ...(options.agentOptions === undefined ? {} : { agentOptions: options.agentOptions }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
          })
        },
      })

      await root.plugin(InMemoryTenantAgentRepository)
      await root.plugin(PrincipalMcpProvider)
      await root.plugin(PrincipalSecretProvider)
      await root.plugin(SharedDshRuntimePartitionProvider)
      await root.plugin(MultiTenantService)

      expect(root.runtimePartitions).toBeInstanceOf(RuntimePartitionProvider)
      const alice = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
      const bob = createPrincipalContext({ tenantId: 'acme', principalId: 'bob' })
      const [aliceAgent, bobAgent] = await Promise.all([
        root.multiTenant.create(alice),
        root.multiTenant.create(bob),
      ])
      expect(aliceAgent.mcpServers).toEqual(['shared'])
      expect(bobAgent.mcpServers).toEqual(['shared'])
      expect(live).toHaveLength(2)

      const identity = async (principal: PrincipalContext, id: typeof aliceAgent.id) => {
        return root.multiTenant.withAgent(principal, id, async runtime => {
          const result: any = await runtime.executeTool('mcp__shared__identity', {})
          expect(result.isError).toBe(false)
          const text = result.value?.content?.find((block: any) => block.type === 'text')?.text
          if (typeof text !== 'string') throw new Error('MCP identity tool returned no text')
          return JSON.parse(text)
        })
      }
      await expect(identity(alice, aliceAgent.id)).resolves.toEqual({
        tenant: 'acme', principal: 'alice', credentialAccepted: true,
      })
      await expect(identity(bob, bobAgent.id)).resolves.toEqual({
        tenant: 'acme', principal: 'bob', credentialAccepted: true,
      })

      await root.multiTenant.delete(alice, aliceAgent.id)
      await expect(identity(bob, bobAgent.id)).resolves.toEqual({
        tenant: 'acme', principal: 'bob', credentialAccepted: true,
      })
    } finally {
      await root.fiber.dispose()
    }
  }, 30_000)
})
