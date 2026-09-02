/** dsh-multi-tenant — a DSH-native multi-tenant Agent plugin. */

import type { Context } from '@deepseek-ai/cordis'
import { EmptyTenantMcpProvider } from './mcp.ts'
import { UnavailableSecretProvider } from './secrets.ts'
import { InMemoryTenantAgentRepository } from './repository.ts'
import { SharedDshRuntimePartitionProvider } from './runtime-driver.ts'
import { MultiTenantService, type MultiTenantConfig } from './service.ts'
import { SQLiteTenantAgentRepository, type SQLiteTenantAgentRepositoryConfig } from './sqlite.ts'

export const name = 'multi-tenant'
export const inject = ['agents', 'tools']

export interface Config extends MultiTenantConfig {
  /** Default SQLite repository configuration. Ignored when the host registered its own repository. */
  readonly sqlite?: SQLiteTenantAgentRepositoryConfig
  /** Use the ephemeral repository instead of SQLite. Intended for tests only. */
  readonly ephemeral?: boolean
}

/**
 * Install missing reference providers, then publish `ctx.multiTenant`.
 * A host replaces any provider by registering the same Cordis service before this plugin.
 */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  if (ctx.get('tenantAgentRepository') === undefined) {
    if (config.ephemeral === true) await ctx.plugin(InMemoryTenantAgentRepository)
    else await ctx.plugin(SQLiteTenantAgentRepository, config.sqlite)
  }
  if (ctx.get('tenantMcp') === undefined) await ctx.plugin(EmptyTenantMcpProvider)
  if (ctx.get('multiTenantSecrets') === undefined) await ctx.plugin(UnavailableSecretProvider)
  if (ctx.get('runtimePartitions') === undefined) await ctx.plugin(SharedDshRuntimePartitionProvider)
  await ctx.plugin(MultiTenantService, {
    ...(config.minimumIsolation === undefined ? {} : { minimumIsolation: config.minimumIsolation }),
    ...(config.policyRevision === undefined ? {} : { policyRevision: config.policyRevision }),
  })
}

export default apply

export { MultiTenantService } from './service.ts'
export type { MultiTenantConfig } from './service.ts'

export {
  createPrincipalContext,
  assertPrincipalContext,
  parseAgentId,
} from './types.ts'
export type {
  AgentId,
  PrincipalContext,
  PrincipalIdentity,
  TenantAgent,
  TenantAgentRecord,
  AgentRecordState,
  AgentRecordTransition,
  CreateAgentOptions,
  IsolationLevel,
} from './types.ts'

export { TenantAgentRepository, InMemoryTenantAgentRepository } from './repository.ts'
export {
  SecretProvider,
  RuntimePartitionProvider,
} from './protocols.ts'
export type {
  PrincipalProvider,
  SecretLease,
  TenantAgentRuntime,
  ExecuteToolOptions,
  DshRuntimeDriver,
  DshRuntimeAgentHandle,
  DshAgentSpecification,
  RuntimePartitionRequest,
  RuntimePartitionLease,
} from './protocols.ts'
export {
  StaticSecretProvider,
  UnavailableSecretProvider,
} from './secrets.ts'
export type { StaticSecretProviderConfig } from './secrets.ts'
export { SharedDshRuntimePartitionProvider } from './runtime-driver.ts'

export {
  TenantMcpProvider,
  EmptyTenantMcpProvider,
  StaticTenantMcpProvider,
} from './mcp.ts'
export type {
  TenantMcpSnapshot,
  TenantMcpServer,
  TenantMcpStdioServer,
  TenantMcpHttpServer,
  McpSecretBinding,
  McpReconnectConfig,
  ResolvedMcpServer,
  StaticTenantMcpProviderConfig,
} from './mcp.ts'

export {
  MultiTenantError,
  ValidationError,
  AuthenticationRequiredError,
  AgentNotFoundError,
  AgentRecordConflictError,
  CapabilityUnavailableError,
  IsolationUnavailableError,
  AgentProvisioningError,
  ServiceClosedError,
} from './errors.ts'
