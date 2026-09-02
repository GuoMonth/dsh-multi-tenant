/** Default logical-isolation driver over the current DSH Agent registry. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type { ToolExecutionResult, ToolRuntime } from '@deepseek-ai/dsh-tools'
import { CapabilityUnavailableError } from './errors.ts'
import {
  RuntimePartitionProvider,
  type DshAgentSpecification,
  type DshRuntimeAgentHandle,
  type DshRuntimeDriver,
  type ExecuteToolOptions,
  type RuntimePartitionLease,
  type RuntimePartitionRequest,
  type TenantAgentRuntime,
} from './protocols.ts'

interface AgentRegistryLike {
  create(options: Record<string, unknown>): Promise<AgentHandle>
  resume(options: Record<string, unknown>): Promise<AgentHandle>
}

function requireService<T extends object>(ctx: Context, key: string): T {
  const service = ctx.get(key)
  if (typeof service !== 'object' || service === null) {
    throw new CapabilityUnavailableError(`Required DSH service "${key}" is unavailable.`)
  }
  return service as T
}

function setupMcp(specification: DshAgentSpecification): (ctx: Context) => Promise<void> {
  return async (agentCtx) => {
    for (const server of specification.mcpServers) {
      specification.signal?.throwIfAborted()
      await agentCtx.plugin(McpClient, server as McpClient.Config)
    }
  }
}

function cancel(agent: Agent, reason = 'multi-tenant runtime invalidated'): void {
  agent.cancel({ kind: 'hook', reason })
}

function runtimeView(agent: Agent, tools: ToolRuntime): TenantAgentRuntime {
  return Object.freeze({
    followup: agent.followup.bind(agent),
    steer: agent.steer.bind(agent),
    inject: agent.inject.bind(agent),
    cancel: (reason?: string) => cancel(agent, reason),
    whenIdle: agent.whenIdle.bind(agent),
    executeTool: async (name: string, args: unknown, options: ExecuteToolOptions = {}): Promise<ToolExecutionResult> => {
      const controller = options.signal === undefined ? new AbortController() : undefined
      return tools.execute({
        callId: `dsh-mt-${randomUUID()}` as never,
        name,
        arguments: args,
        agent,
        signal: options.signal ?? controller!.signal,
      })
    },
  })
}

class SharedDshRuntimeDriver implements DshRuntimeDriver {
  private readonly agents: AgentRegistryLike
  private readonly tools: ToolRuntime

  constructor(ctx: Context) {
    this.agents = requireService<AgentRegistryLike>(ctx, 'agents')
    this.tools = requireService<ToolRuntime>(ctx, 'tools')
  }

  create(specification: DshAgentSpecification): Promise<DshRuntimeAgentHandle> {
    return this.launch('create', specification)
  }

  resume(specification: DshAgentSpecification): Promise<DshRuntimeAgentHandle> {
    return this.launch('resume', specification)
  }

  private async launch(
    mode: 'create' | 'resume',
    specification: DshAgentSpecification,
  ): Promise<DshRuntimeAgentHandle> {
    specification.signal?.throwIfAborted()
    const common = {
      signal: specification.signal,
      setup: setupMcp(specification),
      ...(specification.agentOptions === undefined ? {} : { agentOptions: specification.agentOptions }),
    }
    const handle = mode === 'create'
      ? await this.agents.create({
        ...common,
        sessionId: specification.sessionId,
        ...(specification.meta === undefined ? {} : { meta: specification.meta }),
      })
      : await this.agents.resume({
        ...common,
        resumeSessionId: specification.sessionId,
      })
    return Object.freeze({
      runtime: runtimeView(handle.agent, this.tools),
      dispose: () => handle.dispose(),
    })
  }
}

export class SharedDshRuntimePartitionProvider extends RuntimePartitionProvider {
  private readonly driver: DshRuntimeDriver

  constructor(ctx: Context) {
    super(ctx)
    this.driver = new SharedDshRuntimeDriver(ctx)
  }

  override async acquire(request: RuntimePartitionRequest): Promise<RuntimePartitionLease> {
    request.signal?.throwIfAborted()
    return Object.freeze({
      isolation: 'logical' as const,
      driver: this.driver,
      dispose() {},
    })
  }
}

export default SharedDshRuntimePartitionProvider
