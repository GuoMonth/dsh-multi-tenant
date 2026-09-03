/** Narrow host protocols for guarantees that the plugin cannot own. */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { ResolvedMcpServer } from './mcp.ts'
import type { AgentId, CreateAgentOptions, IsolationLevel, PrincipalContext } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    multiTenantSecrets: SecretProvider
    runtimePartitions: RuntimePartitionProvider
  }
}

export interface PrincipalProvider<Request> {
  /** Authentication, tenant selection, and CSRF/origin policy are host responsibilities. */
  authenticate(request: Request): PrincipalContext | undefined | PromiseLike<PrincipalContext | undefined>
}

export interface SecretLease {
  /** Must change whenever the effective secret capability changes. */
  readonly revision: string
  readonly values: Readonly<Record<string, string>>
  /** Aborted by the provider when these values must no longer power a live Agent. */
  readonly signal: AbortSignal
  /** Must be safe to call more than once. */
  dispose(): void | PromiseLike<void>
}

export abstract class SecretProvider extends Service {
  constructor(ctx: Context) {
    super(ctx, 'multiTenantSecrets')
  }

  abstract acquire(
    principal: PrincipalContext,
    names: readonly string[],
    /** Aborted when the owning MultiTenantService begins shutdown. */
    signal: AbortSignal,
  ): Promise<SecretLease>
}

export interface ExecuteToolOptions {
  readonly signal?: AbortSignal
}

/** Safe projection of a live DSH Agent. It deliberately omits ids, Context, and disposal. */
export interface TenantAgentRuntime {
  followup(message: UserMessage): void
  steer(message: UserMessage): void
  inject(message: UserMessage): void
  cancel(reason?: string): void
  whenIdle(): Promise<void>
  executeTool(name: string, args: unknown, options?: ExecuteToolOptions): Promise<ToolExecutionResult>
}

export interface DshRuntimeAgentHandle {
  readonly runtime: TenantAgentRuntime
  dispose(): Promise<void>
}

export interface DshAgentSpecification extends CreateAgentOptions {
  readonly sessionId: string
  readonly mcpServers: readonly ResolvedMcpServer[]
  /** Combines service shutdown with SecretLease revocation. */
  readonly signal: AbortSignal
}

export interface DshRuntimeDriver {
  create(specification: DshAgentSpecification): Promise<DshRuntimeAgentHandle>
  resume(specification: DshAgentSpecification): Promise<DshRuntimeAgentHandle>
}

export interface RuntimePartitionRequest {
  readonly principal: PrincipalContext
  readonly agentId: AgentId
  readonly requiredIsolation: IsolationLevel
  /** Combines service shutdown with SecretLease revocation. */
  readonly signal: AbortSignal
}

export interface RuntimePartitionLease {
  /** A host claim negotiated by the plugin, not proof of an isolation mechanism. */
  readonly isolation: IsolationLevel
  readonly driver: DshRuntimeDriver
  /** Must be safe to call more than once. */
  dispose(): void | PromiseLike<void>
}

export abstract class RuntimePartitionProvider extends Service {
  constructor(ctx: Context) {
    super(ctx, 'runtimePartitions')
  }

  abstract acquire(request: RuntimePartitionRequest): Promise<RuntimePartitionLease>
}
