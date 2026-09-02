/** Tenant MCP declarations and Principal-secret materialization. */

import { Service, type Context } from '@deepseek-ai/cordis'
import { CapabilityUnavailableError, ValidationError } from './errors.ts'
import type { SecretLease } from './protocols.ts'
import type { PrincipalContext } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantMcp: TenantMcpProvider
  }
}

const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/

export interface McpSecretBinding {
  readonly secret: string
  readonly prefix?: string
}

export interface McpReconnectConfig {
  readonly enabled?: boolean
  readonly initialDelayMs?: number
  readonly maxDelayMs?: number
  readonly maxAttempts?: number
}

interface TenantMcpServerBase {
  readonly serverName: string
  readonly toolCallTimeoutMs?: number
  readonly reconnect?: McpReconnectConfig
}

export interface TenantMcpStdioServer extends TenantMcpServerBase {
  readonly transport: 'stdio'
  readonly command: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly secretEnv?: Readonly<Record<string, McpSecretBinding>>
  readonly cwd?: string
}

export interface TenantMcpHttpServer extends TenantMcpServerBase {
  readonly transport: 'streamable-http'
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly secretHeaders?: Readonly<Record<string, McpSecretBinding>>
}

export type TenantMcpServer = TenantMcpStdioServer | TenantMcpHttpServer

export interface TenantMcpSnapshot {
  readonly revision: string
  readonly servers: readonly TenantMcpServer[]
}

export type ResolvedMcpServer =
  | {
    readonly transport: 'stdio'
    readonly serverName: string
    readonly command: string
    readonly args: string[]
    readonly env: Record<string, string>
    readonly cwd: string
    readonly toolCallTimeoutMs: number
    readonly failOnStartupError: true
    readonly reconnect?: McpReconnectConfig
  }
  | {
    readonly transport: 'streamable-http'
    readonly serverName: string
    readonly url: string
    readonly headers: Record<string, string>
    readonly toolCallTimeoutMs: number
    readonly failOnStartupError: true
    readonly reconnect?: McpReconnectConfig
  }

export abstract class TenantMcpProvider extends Service {
  constructor(ctx: Context) {
    super(ctx, 'tenantMcp')
  }

  abstract load(principal: PrincipalContext, signal?: AbortSignal): Promise<TenantMcpSnapshot>
}

/** Default: a valid Agent with no tenant-specific MCP servers. */
export class EmptyTenantMcpProvider extends TenantMcpProvider {
  override async load(): Promise<TenantMcpSnapshot> {
    return Object.freeze({ revision: 'empty-v1', servers: Object.freeze([]) })
  }
}

export interface StaticTenantMcpProviderConfig {
  readonly revision?: string
  readonly servers?: readonly TenantMcpServer[]
}

/** Simple provider for one static deployment configuration. */
export class StaticTenantMcpProvider extends TenantMcpProvider {
  private readonly snapshot: TenantMcpSnapshot

  constructor(ctx: Context, config: StaticTenantMcpProviderConfig = {}) {
    super(ctx)
    this.snapshot = normalizeTenantMcpSnapshot({
      revision: config.revision ?? 'static-v1',
      servers: config.servers ?? [],
    })
  }

  override async load(): Promise<TenantMcpSnapshot> {
    return this.snapshot
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new ValidationError(`${label} must be a non-empty trimmed string`)
  }
  return value
}

function stringRecord(value: Readonly<Record<string, string>> | undefined, label: string): Readonly<Record<string, string>> {
  if (value === undefined) return Object.freeze({})
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ValidationError(`${label} must be a record`)
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    requiredString(key, `${label} key`)
    if (typeof item !== 'string') throw new ValidationError(`${label}.${key} must be a string`)
    result[key] = item
  }
  return Object.freeze(result)
}

function bindingRecord(
  value: Readonly<Record<string, McpSecretBinding>> | undefined,
  label: string,
): Readonly<Record<string, McpSecretBinding>> {
  if (value === undefined) return Object.freeze({})
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ValidationError(`${label} must be a record`)
  const result: Record<string, McpSecretBinding> = {}
  for (const [key, item] of Object.entries(value)) {
    requiredString(key, `${label} key`)
    if (typeof item !== 'object' || item === null) throw new ValidationError(`${label}.${key} must be an object`)
    const secret = requiredString(item.secret, `${label}.${key}.secret`)
    if (item.prefix !== undefined && typeof item.prefix !== 'string') {
      throw new ValidationError(`${label}.${key}.prefix must be a string`)
    }
    result[key] = Object.freeze({ secret, ...(item.prefix === undefined ? {} : { prefix: item.prefix }) })
  }
  return Object.freeze(result)
}

function reconnect(value: McpReconnectConfig | undefined): McpReconnectConfig | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) throw new ValidationError('MCP reconnect must be an object')
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new ValidationError('MCP reconnect.enabled must be boolean')
  for (const [key, item] of Object.entries(value)) {
    if (key === 'enabled') continue
    if (!Number.isSafeInteger(item) || Number(item) <= 0) throw new ValidationError(`MCP reconnect.${key} must be a positive integer`)
  }
  return Object.freeze({ ...value })
}

function timeout(value: number | undefined): number {
  const result = value ?? 60_000
  if (!Number.isSafeInteger(result) || result <= 0) throw new ValidationError('MCP toolCallTimeoutMs must be a positive integer')
  return result
}

function collisions(
  fixed: Readonly<Record<string, string>>,
  bindings: Readonly<Record<string, McpSecretBinding>>,
  label: string,
): void {
  for (const key of Object.keys(bindings)) {
    if (Object.hasOwn(fixed, key)) throw new ValidationError(`${label} ${key} cannot be both static and secret-bound`)
  }
}

export function normalizeTenantMcpSnapshot(snapshot: TenantMcpSnapshot): TenantMcpSnapshot {
  if (typeof snapshot !== 'object' || snapshot === null || !Array.isArray(snapshot.servers)) {
    throw new ValidationError('Tenant MCP snapshot must contain a servers array')
  }
  const revision = requiredString(snapshot.revision, 'Tenant MCP revision')
  const names = new Set<string>()
  const servers = snapshot.servers.map((server): TenantMcpServer => {
    if (typeof server !== 'object' || server === null || !SERVER_NAME.test(server.serverName)) {
      throw new ValidationError('MCP serverName must match [A-Za-z0-9_-]{1,32}')
    }
    if (names.has(server.serverName)) throw new ValidationError(`duplicate MCP serverName "${server.serverName}"`)
    names.add(server.serverName)
    const common = {
      serverName: server.serverName,
      toolCallTimeoutMs: timeout(server.toolCallTimeoutMs),
      ...(server.reconnect === undefined ? {} : { reconnect: reconnect(server.reconnect)! }),
    }
    if (server.transport === 'stdio') {
      const env = stringRecord(server.env, `${server.serverName}.env`)
      const secretEnv = bindingRecord(server.secretEnv, `${server.serverName}.secretEnv`)
      collisions(env, secretEnv, `${server.serverName} env key`)
      return Object.freeze({
        ...common,
        transport: 'stdio',
        command: requiredString(server.command, `${server.serverName}.command`),
        args: Object.freeze([...(server.args ?? [])]),
        env,
        secretEnv,
        cwd: server.cwd ?? '',
      })
    }
    if (server.transport === 'streamable-http') {
      const headers = stringRecord(server.headers, `${server.serverName}.headers`)
      const secretHeaders = bindingRecord(server.secretHeaders, `${server.serverName}.secretHeaders`)
      collisions(headers, secretHeaders, `${server.serverName} header`)
      return Object.freeze({
        ...common,
        transport: 'streamable-http',
        url: requiredString(server.url, `${server.serverName}.url`),
        headers,
        secretHeaders,
      })
    }
    throw new ValidationError('unsupported MCP transport')
  })
  return Object.freeze({ revision, servers: Object.freeze(servers) })
}

export function requiredSecretNames(snapshot: TenantMcpSnapshot): readonly string[] {
  const names = new Set<string>()
  for (const server of snapshot.servers) {
    const bindings = server.transport === 'stdio' ? server.secretEnv : server.secretHeaders
    for (const binding of Object.values(bindings ?? {})) names.add(binding.secret)
  }
  return Object.freeze([...names].sort())
}

function materialize(
  fixed: Readonly<Record<string, string>>,
  bindings: Readonly<Record<string, McpSecretBinding>> | undefined,
  lease: SecretLease,
): Record<string, string> {
  const result = { ...fixed }
  for (const [key, binding] of Object.entries(bindings ?? {})) {
    const value = lease.values[binding.secret]
    if (value === undefined) throw new CapabilityUnavailableError(`Required secret "${binding.secret}" is unavailable.`)
    result[key] = `${binding.prefix ?? ''}${value}`
  }
  return result
}

export function resolveMcpServers(snapshot: TenantMcpSnapshot, lease: SecretLease): readonly ResolvedMcpServer[] {
  lease.signal.throwIfAborted()
  return Object.freeze(snapshot.servers.map((server): ResolvedMcpServer => {
    if (server.transport === 'stdio') {
      return Object.freeze({
        transport: 'stdio',
        serverName: server.serverName,
        command: server.command,
        args: [...(server.args ?? [])],
        env: materialize(server.env ?? {}, server.secretEnv, lease),
        cwd: server.cwd ?? '',
        toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000,
        failOnStartupError: true,
        ...(server.reconnect === undefined ? {} : { reconnect: server.reconnect }),
      })
    }
    return Object.freeze({
      transport: 'streamable-http',
      serverName: server.serverName,
      url: server.url,
      headers: materialize(server.headers ?? {}, server.secretHeaders, lease),
      toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000,
      failOnStartupError: true,
      ...(server.reconnect === undefined ? {} : { reconnect: server.reconnect }),
    })
  }))
}
