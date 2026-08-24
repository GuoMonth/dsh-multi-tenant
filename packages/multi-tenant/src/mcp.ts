import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  defineCapability,
  provideCapability,
  type CapabilityToken,
} from './capability.ts'
import type {
  CapabilityProviderDefinition,
  CapabilityProviderPreparation,
} from './composition.ts'
import {
  principalCredentials,
  type PrincipalCredentials,
} from './credentials.ts'
import type { ComposedPrincipal } from './runtime-composition.ts'
import { tenantIdOf } from './runtime.ts'
import { validateSessionId } from './validation.ts'

const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'
const MCP_SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/
const RUNTIME_NAMESPACE_HASH_LENGTH = 16
const RUNTIME_NAMESPACE_BASE_LENGTH = 32 - RUNTIME_NAMESPACE_HASH_LENGTH - 1

export class McpIntegrationError extends Error {
  override name = 'McpIntegrationError'
}

export class McpIntegrationDependencyError extends McpIntegrationError {
  override name = 'McpIntegrationDependencyError'
}

export class McpAgentServiceUnavailableError extends McpIntegrationError {
  override name = 'McpAgentServiceUnavailableError'
}

export interface McpCredentialBinding {
  readonly credential: string
  readonly prefix?: string
}

export interface McpReconnectConfig {
  readonly enabled?: boolean
  readonly initialDelayMs?: number
  readonly maxDelayMs?: number
  readonly maxAttempts?: number
}

interface TenantMcpServerBase {
  /** Logical product-facing server name. Runtime instances derive a collision-safe DSH namespace from it. */
  readonly serverName: string
  readonly toolCallTimeoutMs?: number
  readonly reconnect?: McpReconnectConfig
}

export interface TenantMcpStdioServer extends TenantMcpServerBase {
  readonly transport: 'stdio'
  readonly command: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  /** Environment variables whose values are resolved from PrincipalCredentials during Agent setup. */
  readonly credentialEnv?: Readonly<Record<string, McpCredentialBinding>>
  readonly cwd?: string
}

export interface TenantMcpHttpServer extends TenantMcpServerBase {
  readonly transport: 'streamable-http'
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  /** HTTP headers whose values are resolved from PrincipalCredentials during Agent setup. */
  readonly credentialHeaders?: Readonly<Record<string, McpCredentialBinding>>
}

export type TenantMcpServer = TenantMcpStdioServer | TenantMcpHttpServer

export interface TenantMcpConfig {
  readonly servers: readonly TenantMcpServer[]
}

export const tenantMcpConfig = defineCapability<TenantMcpConfig, 'tenant'>(
  'dsh-multi-tenant.mcp-config',
  'tenant',
)

export interface TenantMcpConfigFactoryPreparation {
  readonly ctx: Context
  readonly tenantId: string
  readonly signal: AbortSignal
}

export interface TenantMcpConfigProviderOptions {
  readonly id: string
  readonly definitionKey?: string
  readonly requires?: readonly CapabilityToken[]
  load(
    preparation: TenantMcpConfigFactoryPreparation,
  ): TenantMcpConfig | PromiseLike<TenantMcpConfig>
}

export interface McpAgentOptions {
  readonly provider?: string
  readonly model?: string
  readonly maxTokens?: number
}

export interface McpAgentCreateMeta {
  readonly cwd?: string
  readonly parentSession?: string
  readonly seedLength?: number
  readonly origin?: 'subagent'
  readonly delegationDepth?: number
  readonly agentPreset?: string
}

export interface McpAgentSetupCommit {
  commit(): void
}

export type McpAgentSetup = (
  agentCtx: Context,
) => McpAgentSetupCommit | PromiseLike<McpAgentSetupCommit | void> | void

export interface McpAgentCreateOptions {
  readonly sessionId: string
  readonly agentOptions?: McpAgentOptions
  readonly meta?: McpAgentCreateMeta
  readonly setup?: McpAgentSetup
}

export interface McpAgentResumeOptions {
  readonly sessionId: string
  readonly agentOptions?: McpAgentOptions
  readonly setup?: McpAgentSetup
}

export interface McpRuntimeServer {
  /** Logical name from TenantMcpConfig. */
  readonly serverName: string
  /** Physical DSH MCP namespace, deterministic per Principal + Session. */
  readonly runtimeServerName: string
  /** Prefix of every native DSH tool registered by this server. */
  readonly toolPrefix: string
}

export interface McpAgentLike {
  readonly id: string
  readonly ctx: Context
}

export interface McpAgentHandle<A extends McpAgentLike = McpAgentLike> {
  readonly agent: A
  readonly sessionId: string
  readonly servers: readonly McpRuntimeServer[]
  dispose(): Promise<void>
}

export interface McpAgentIntegration {
  readonly principal: ComposedPrincipal
  create<A extends McpAgentLike = McpAgentLike>(options: McpAgentCreateOptions): Promise<McpAgentHandle<A>>
  resume<A extends McpAgentLike = McpAgentLike>(options: McpAgentResumeOptions): Promise<McpAgentHandle<A>>
}

interface DshAgentHandle {
  readonly agent: McpAgentLike
  dispose(): Promise<void>
}

interface DshAgentRegistry {
  create(options: {
    readonly sessionId: string
    readonly agentOptions?: McpAgentOptions
    readonly meta?: McpAgentCreateMeta
    readonly signal?: AbortSignal
    readonly setup?: McpAgentSetup
  }): Promise<DshAgentHandle>
  resume(options: {
    readonly resumeSessionId: string
    readonly agentOptions?: McpAgentOptions
    readonly signal?: AbortSignal
    readonly setup?: McpAgentSetup
  }): Promise<DshAgentHandle>
}

interface SessionOwnershipService {
  claimSession(sessionId: string, principal: Readonly<{ tenantId: string; userId: string }>): Promise<void>
  assertSessionAccess(principal: Readonly<{ tenantId: string; userId: string }>, sessionId: string): Promise<void>
}

interface DshMcpClientPlugin {
  readonly name?: string
  readonly inject?: readonly string[]
  apply(ctx: Context, config: ResolvedMcpClientConfig): PromiseLike<void> | void
}

interface ResolvedMcpReconnectConfig {
  readonly enabled?: boolean
  readonly initialDelayMs?: number
  readonly maxDelayMs?: number
  readonly maxAttempts?: number
}

type ResolvedMcpClientConfig =
  | {
    readonly transport: 'stdio'
    readonly serverName: string
    readonly command: string
    readonly args: string[]
    readonly env: Record<string, string>
    readonly cwd: string
    readonly toolCallTimeoutMs: number
    readonly failOnStartupError: true
    readonly reconnect?: ResolvedMcpReconnectConfig
  }
  | {
    readonly transport: 'streamable-http'
    readonly serverName: string
    readonly url: string
    readonly headers: Record<string, string>
    readonly toolCallTimeoutMs: number
    readonly failOnStartupError: true
    readonly reconnect?: ResolvedMcpReconnectConfig
  }

let mcpClientModule: Promise<DshMcpClientPlugin> | undefined

function validateName(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${label} must be a non-empty trimmed string`)
  }
}

function validateServerName(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !MCP_SERVER_NAME.test(value)) {
    throw new TypeError('MCP serverName must match [A-Za-z0-9_-]{1,32}')
  }
}

function normalizeTimeout(value: number | undefined): number {
  const timeout = value ?? 60_000
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new TypeError('MCP toolCallTimeoutMs must be positive and finite')
  }
  return timeout
}

function normalizeBinding(binding: McpCredentialBinding, label: string): McpCredentialBinding {
  if (typeof binding !== 'object' || binding === null) throw new TypeError(`${label} must be an object`)
  validateName(binding.credential, `${label}.credential`)
  if (binding.prefix !== undefined && typeof binding.prefix !== 'string') {
    throw new TypeError(`${label}.prefix must be a string`)
  }
  return Object.freeze({
    credential: binding.credential,
    ...(binding.prefix === undefined ? {} : { prefix: binding.prefix }),
  })
}

function normalizeStringRecord(
  values: Readonly<Record<string, string>> | undefined,
  label: string,
): Readonly<Record<string, string>> {
  const normalized: Record<string, string> = {}
  if (values === undefined) return Object.freeze(normalized)
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    throw new TypeError(`${label} must be a record`)
  }
  for (const [key, value] of Object.entries(values)) {
    validateName(key, `${label} key`)
    if (typeof value !== 'string') throw new TypeError(`${label}.${key} must be a string`)
    normalized[key] = value
  }
  return Object.freeze(normalized)
}

function normalizeBindingRecord(
  values: Readonly<Record<string, McpCredentialBinding>> | undefined,
  label: string,
): Readonly<Record<string, McpCredentialBinding>> {
  const normalized: Record<string, McpCredentialBinding> = {}
  if (values === undefined) return Object.freeze(normalized)
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    throw new TypeError(`${label} must be a record`)
  }
  for (const [key, binding] of Object.entries(values)) {
    validateName(key, `${label} key`)
    normalized[key] = normalizeBinding(binding, `${label}.${key}`)
  }
  return Object.freeze(normalized)
}

function assertNoBindingCollisions(
  staticValues: Readonly<Record<string, string>>,
  bindings: Readonly<Record<string, McpCredentialBinding>>,
  label: string,
): void {
  for (const key of Object.keys(bindings)) {
    if (Object.hasOwn(staticValues, key)) {
      throw new TypeError(`${label} "${key}" cannot be both static and credential-bound`)
    }
  }
}

function normalizeReconnect(value: McpReconnectConfig | undefined): McpReconnectConfig | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) throw new TypeError('MCP reconnect must be an object')
  const normalized: McpReconnectConfig = {
    ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
    ...(value.initialDelayMs === undefined ? {} : { initialDelayMs: value.initialDelayMs }),
    ...(value.maxDelayMs === undefined ? {} : { maxDelayMs: value.maxDelayMs }),
    ...(value.maxAttempts === undefined ? {} : { maxAttempts: value.maxAttempts }),
  }
  if (normalized.enabled !== undefined && typeof normalized.enabled !== 'boolean') {
    throw new TypeError('MCP reconnect.enabled must be boolean')
  }
  for (const [name, number] of [
    ['initialDelayMs', normalized.initialDelayMs],
    ['maxDelayMs', normalized.maxDelayMs],
    ['maxAttempts', normalized.maxAttempts],
  ] as const) {
    if (number !== undefined && (!Number.isFinite(number) || number <= 0)) {
      throw new TypeError(`MCP reconnect.${name} must be positive and finite`)
    }
  }
  return Object.freeze(normalized)
}

/** Normalize and freeze Tenant MCP configuration before it becomes a Runtime capability. */
export function normalizeTenantMcpConfig(config: TenantMcpConfig): TenantMcpConfig {
  if (typeof config !== 'object' || config === null || !Array.isArray(config.servers)) {
    throw new TypeError('TenantMcpConfig.servers must be an array')
  }
  const names = new Set<string>()
  const servers = config.servers.map((server): TenantMcpServer => {
    if (typeof server !== 'object' || server === null) throw new TypeError('MCP server must be an object')
    validateServerName(server.serverName)
    if (names.has(server.serverName)) throw new TypeError(`duplicate MCP serverName "${server.serverName}"`)
    names.add(server.serverName)
    const toolCallTimeoutMs = normalizeTimeout(server.toolCallTimeoutMs)
    const reconnect = normalizeReconnect(server.reconnect)
    if (server.transport === 'stdio') {
      validateName(server.command, `MCP server ${server.serverName}.command`)
      const env = normalizeStringRecord(server.env, `MCP server ${server.serverName}.env`)
      const credentialEnv = normalizeBindingRecord(server.credentialEnv, `MCP server ${server.serverName}.credentialEnv`)
      assertNoBindingCollisions(env, credentialEnv, `MCP server ${server.serverName} env key`)
      return Object.freeze({
        transport: 'stdio',
        serverName: server.serverName,
        command: server.command,
        args: Object.freeze([...(server.args ?? [])]),
        env,
        credentialEnv,
        cwd: server.cwd ?? '',
        toolCallTimeoutMs,
        ...(reconnect === undefined ? {} : { reconnect }),
      })
    }
    if (server.transport === 'streamable-http') {
      validateName(server.url, `MCP server ${server.serverName}.url`)
      const headers = normalizeStringRecord(server.headers, `MCP server ${server.serverName}.headers`)
      const credentialHeaders = normalizeBindingRecord(server.credentialHeaders, `MCP server ${server.serverName}.credentialHeaders`)
      assertNoBindingCollisions(headers, credentialHeaders, `MCP server ${server.serverName} header`)
      return Object.freeze({
        transport: 'streamable-http',
        serverName: server.serverName,
        url: server.url,
        headers,
        credentialHeaders,
        toolCallTimeoutMs,
        ...(reconnect === undefined ? {} : { reconnect }),
      })
    }
    throw new TypeError(`unsupported MCP transport ${String((server as { transport?: unknown }).transport)}`)
  })
  return Object.freeze({ servers: Object.freeze(servers) })
}

/** Adapt product-owned Tenant MCP loading into the generic Tenant capability provider contract. */
export function defineTenantMcpConfigProvider(
  options: TenantMcpConfigProviderOptions,
): CapabilityProviderDefinition<typeof tenantMcpConfig> {
  if (typeof options?.load !== 'function') throw new TypeError('Tenant MCP config provider load must be a function')
  return Object.freeze({
    id: options.id,
    capability: tenantMcpConfig,
    ...(options.definitionKey === undefined ? {} : { definitionKey: options.definitionKey }),
    ...(options.requires === undefined ? {} : { requires: options.requires }),
    async setup({ ctx, signal }: CapabilityProviderPreparation) {
      const tenantId = tenantIdOf(ctx)
      if (tenantId === undefined) {
        throw new TypeError('Tenant MCP config provider must materialize inside a Tenant Runtime scope')
      }
      const config = normalizeTenantMcpConfig(await options.load({ ctx, tenantId, signal }))
      provideCapability(ctx, tenantMcpConfig, config)
    },
  })
}

/**
 * Derive the physical DSH MCP namespace for one logical server in one Principal Session.
 * The suffix avoids the upstream mcp-client root-wide serverName reservation collision;
 * the same Principal + Session receives the same namespace across resume.
 */
export function runtimeMcpServerName(
  serverName: string,
  principal: Readonly<{ tenantId: string; userId: string }>,
  sessionId: string,
): string {
  validateServerName(serverName)
  validateName(principal?.tenantId, 'principal.tenantId')
  validateName(principal?.userId, 'principal.userId')
  validateSessionId(sessionId)
  const hash = createHash('sha256')
    .update(JSON.stringify([serverName, principal.tenantId, principal.userId, sessionId]))
    .digest('hex')
    .slice(0, RUNTIME_NAMESPACE_HASH_LENGTH)
  return `${serverName.slice(0, RUNTIME_NAMESPACE_BASE_LENGTH)}-${hash}`
}

function describeRuntimeServers(
  config: TenantMcpConfig,
  principal: Readonly<{ tenantId: string; userId: string }>,
  sessionId: string,
): readonly McpRuntimeServer[] {
  return Object.freeze(config.servers.map(server => {
    const runtimeServerName = runtimeMcpServerName(server.serverName, principal, sessionId)
    return Object.freeze({
      serverName: server.serverName,
      runtimeServerName,
      toolPrefix: `mcp__${runtimeServerName}__`,
    })
  }))
}

async function resolveCredentialRecord(
  base: Readonly<Record<string, string>>,
  bindings: Readonly<Record<string, McpCredentialBinding>>,
  credentials: PrincipalCredentials,
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = { ...base }
  for (const [key, binding] of Object.entries(bindings)) {
    const value = await credentials.require(binding.credential)
    resolved[key] = `${binding.prefix ?? ''}${value}`
  }
  return resolved
}

async function resolveMcpClientConfig(
  server: TenantMcpServer,
  runtimeServerName: string,
  credentials: PrincipalCredentials,
): Promise<ResolvedMcpClientConfig> {
  if (server.transport === 'stdio') {
    return {
      transport: 'stdio',
      serverName: runtimeServerName,
      command: server.command,
      args: [...(server.args ?? [])],
      env: await resolveCredentialRecord(server.env ?? {}, server.credentialEnv ?? {}, credentials),
      cwd: server.cwd ?? '',
      toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000,
      failOnStartupError: true,
      ...(server.reconnect === undefined ? {} : { reconnect: server.reconnect }),
    }
  }
  return {
    transport: 'streamable-http',
    serverName: runtimeServerName,
    url: server.url,
    headers: await resolveCredentialRecord(server.headers ?? {}, server.credentialHeaders ?? {}, credentials),
    toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000,
    failOnStartupError: true,
    ...(server.reconnect === undefined ? {} : { reconnect: server.reconnect }),
  }
}

async function loadMcpClientPlugin(): Promise<DshMcpClientPlugin> {
  if (mcpClientModule !== undefined) return mcpClientModule
  mcpClientModule = (async () => {
    let imported: unknown
    try {
      imported = await import(MCP_CLIENT_PACKAGE)
    } catch (error) {
      throw new McpIntegrationDependencyError(
        `M5 MCP integration requires ${MCP_CLIENT_PACKAGE} from the compatible DeepSeek Harness installation`,
        { cause: error },
      )
    }
    if (typeof imported !== 'object' || imported === null || typeof (imported as { apply?: unknown }).apply !== 'function') {
      throw new McpIntegrationDependencyError(`${MCP_CLIENT_PACKAGE} does not expose the expected Cordis plugin contract`)
    }
    return imported as DshMcpClientPlugin
  })()
  try {
    return await mcpClientModule
  } catch (error) {
    mcpClientModule = undefined
    throw error
  }
}

function requireService<T extends object>(ctx: Context, name: string, methods: readonly string[]): T {
  const value = ctx.get(name)
  if (typeof value !== 'object' || value === null) {
    throw new McpAgentServiceUnavailableError(`required DSH service "${name}" is unavailable`)
  }
  for (const method of methods) {
    if (typeof (value as Record<string, unknown>)[method] !== 'function') {
      throw new McpAgentServiceUnavailableError(`DSH service "${name}" does not implement ${method}()`)
    }
  }
  return value as T
}

function integrationSetup(
  config: TenantMcpConfig,
  credentials: PrincipalCredentials,
  runtimeServers: readonly McpRuntimeServer[],
  userSetup: McpAgentSetup | undefined,
): McpAgentSetup {
  return async (agentCtx: Context) => {
    const mcpClient = await loadMcpClientPlugin()
    for (let index = 0; index < config.servers.length; index += 1) {
      const server = config.servers[index]
      const runtime = runtimeServers[index]
      if (server === undefined || runtime === undefined) throw new McpIntegrationError('MCP runtime server mapping drifted')
      const resolved = await resolveMcpClientConfig(server, runtime.runtimeServerName, credentials)
      await agentCtx.plugin(mcpClient, resolved)
    }
    return userSetup?.(agentCtx)
  }
}

function wrapHandle<A extends McpAgentLike>(
  handle: DshAgentHandle,
  sessionId: string,
  servers: readonly McpRuntimeServer[],
): McpAgentHandle<A> {
  return Object.freeze({
    agent: handle.agent as A,
    sessionId,
    servers,
    dispose: () => handle.dispose(),
  })
}

/**
 * Bind the M5 DSH-native MCP Tools path to one canonical Principal.
 *
 * Each create/resume request is one Principal Operation that captures Tenant MCP
 * config + PrincipalCredentials once. The long-lived DSH Agent itself is created
 * through the Principal Context (not the Operation Fiber), so it survives the
 * short Operation and is structurally drained when the Principal is disposed.
 */
export function createMcpAgentIntegration(principal: ComposedPrincipal): McpAgentIntegration {
  if (typeof principal !== 'object' || principal === null) throw new TypeError('composed Principal is required')

  const launch = async <A extends McpAgentLike>(
    mode: 'create' | 'resume',
    options: McpAgentCreateOptions | McpAgentResumeOptions,
  ): Promise<McpAgentHandle<A>> => {
    validateSessionId(options.sessionId)
    const operation = principal.operations.start({
      requires: [tenantMcpConfig, principalCredentials],
      async execute({ capabilities, signal }) {
        const mcpConfig = capabilities.require(tenantMcpConfig)
        const credentials = capabilities.require(principalCredentials)
        const servers = describeRuntimeServers(mcpConfig, principal.identity, options.sessionId)
        const agents = requireService<DshAgentRegistry>(principal.ctx, 'agents', ['create', 'resume'])
        const ownership = requireService<SessionOwnershipService>(principal.ctx, 'multiTenant', ['claimSession', 'assertSessionAccess'])
        const setup = integrationSetup(mcpConfig, credentials, servers, options.setup)

        let handle: DshAgentHandle
        if (mode === 'create') {
          // Claim is intentionally a durable reservation. The v0 ownership store
          // has no release/delete: a downstream setup failure leaves this id owned
          // by the same Principal, so another Principal can never steal it and the
          // original Principal may safely retry.
          await ownership.claimSession(options.sessionId, principal.identity)
          const createOptions = options as McpAgentCreateOptions
          handle = await agents.create({
            sessionId: createOptions.sessionId,
            signal,
            setup,
            ...(createOptions.agentOptions === undefined ? {} : { agentOptions: createOptions.agentOptions }),
            ...(createOptions.meta === undefined ? {} : { meta: createOptions.meta }),
          })
        } else {
          await ownership.assertSessionAccess(principal.identity, options.sessionId)
          const resumeOptions = options as McpAgentResumeOptions
          handle = await agents.resume({
            resumeSessionId: resumeOptions.sessionId,
            signal,
            setup,
            ...(resumeOptions.agentOptions === undefined ? {} : { agentOptions: resumeOptions.agentOptions }),
          })
        }
        return wrapHandle<A>(handle, options.sessionId, servers)
      },
    })
    return operation.result
  }

  return Object.freeze({
    principal,
    create: <A extends McpAgentLike = McpAgentLike>(options: McpAgentCreateOptions) => launch<A>('create', options),
    resume: <A extends McpAgentLike = McpAgentLike>(options: McpAgentResumeOptions) => launch<A>('resume', options),
  })
}
