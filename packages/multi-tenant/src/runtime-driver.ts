/** Default logical-isolation driver over the current DSH Agent registry. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import type { Agent, AgentRegistry, AgentSetup } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
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

function requireService<K extends 'agents' | 'tools' | 'sessions'>(ctx: Context, key: K): Context[K] {
  const service = ctx.get(key)
  if (typeof service !== 'object' || service === null) {
    throw new CapabilityUnavailableError(`Required DSH service "${key}" is unavailable.`)
  }
  return service
}

function setupMcp(specification: DshAgentSpecification): AgentSetup {
  return async (agentCtx) => {
    for (const server of specification.mcpServers) {
      specification.signal.throwIfAborted()
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
        callId: ToolCallId(`dsh-mt-${randomUUID()}`),
        name,
        arguments: args,
        agent,
        signal: options.signal ?? controller!.signal,
      })
    },
  })
}

class SharedDshRuntimeDriver implements DshRuntimeDriver {
  private readonly agents: Pick<AgentRegistry, 'create' | 'resume'>
  private readonly tools: ToolRuntime
  private readonly sessions: Pick<Context['sessions'], 'flush'>

  constructor(ctx: Context) {
    this.agents = requireService(ctx, 'agents')
    this.tools = requireService(ctx, 'tools')
    this.sessions = requireService(ctx, 'sessions')
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
    specification.signal.throwIfAborted()
    const { agentOptions } = specification
    const { reasoningEffort, ...modelOptions } = agentOptions ?? {}
    const common = {
      signal: specification.signal,
      setup: setupMcp(specification),
      ...(agentOptions === undefined ? {} : {
        agentOptions: {
          ...modelOptions,
          ...(reasoningEffort === undefined ? {} : {
            reasoningEffort: ReasoningEffortId(reasoningEffort),
          }),
        },
      }),
    }
    const handle = mode === 'create'
      ? await this.agents.create({
        ...common,
        sessionId: SessionId(specification.sessionId),
        ...(specification.meta === undefined ? {} : { meta: specification.meta }),
      })
      : await this.agents.resume({
        ...common,
        resumeSessionId: SessionId(specification.sessionId),
      })
    try {
      // DSH defers materializing an empty session. Publish a tenant resource
      // only after its own session has a durability checkpoint; otherwise a
      // ready Directory record can outlive a session that never reached disk.
      if (mode === 'create' && !await this.sessions.flush(handle.agent.session)) {
        throw new CapabilityUnavailableError('DSH session durability checkpoint is unavailable.')
      }
      specification.signal.throwIfAborted()
    } catch (error) {
      await handle.dispose().catch(() => undefined)
      throw error
    }
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
    request.signal.throwIfAborted()
    return Object.freeze({
      isolation: 'logical' as const,
      driver: this.driver,
      dispose() {},
    })
  }
}

export default SharedDshRuntimePartitionProvider
