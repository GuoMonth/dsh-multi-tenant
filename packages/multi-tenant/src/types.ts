/** Public authority and Agent-resource vocabulary. */

import { randomUUID } from 'node:crypto'
import { ValidationError } from './errors.ts'

declare const agentIdBrand: unique symbol
declare const principalContextBrand: unique symbol

export type AgentId = string & { readonly [agentIdBrand]: 'AgentId' }

export interface PrincipalContext {
  readonly tenantId: string
  readonly principalId: string
  readonly [principalContextBrand]: true
}

export interface PrincipalIdentity {
  readonly tenantId: string
  readonly principalId: string
}

export type IsolationLevel = 'logical' | 'strong'
export type AgentRecordState = 'provisioning' | 'ready' | 'failed' | 'deleted'

export interface CreateAgentOptions {
  readonly agentOptions?: {
    readonly provider?: string
    readonly model?: string
    readonly reasoningEffort?: string
    readonly maxTokens?: number
  }
  readonly meta?: {
    readonly cwd?: string
    readonly agentPreset?: string
  }
}

export interface TenantAgent {
  readonly id: AgentId
  readonly state: 'ready'
  readonly mcpServers: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** Repository-only record. `sessionId` never crosses a product-facing boundary. */
export interface TenantAgentRecord {
  readonly id: AgentId
  readonly tenantId: string
  readonly principalId: string
  readonly sessionId: string
  readonly state: AgentRecordState
  readonly revision: number
  readonly capabilityRevision: string
  readonly mcpServers: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt?: string
}

export interface NewTenantAgentRecord {
  readonly id: AgentId
  readonly tenantId: string
  readonly principalId: string
  readonly sessionId: string
  readonly capabilityRevision: string
  readonly mcpServers: readonly string[]
  readonly createdAt: string
}

export interface AgentRecordTransition {
  readonly from: AgentRecordState
  readonly to: AgentRecordState
  readonly capabilityRevision?: string
  readonly mcpServers?: readonly string[]
  readonly at: string
}

const principalContexts = new WeakSet<object>()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function opaque(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new ValidationError(`${label} must be a non-empty trimmed string`)
  }
  return value
}

function allowKeys(value: object, allowed: readonly string[], label: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) {
      throw new ValidationError(`${label} contains an unknown field`)
    }
  }
}

/** Mint a server-side authority object after the host has authenticated the subject. */
export function createPrincipalContext(identity: PrincipalIdentity): PrincipalContext {
  if (typeof identity !== 'object' || identity === null) {
    throw new ValidationError('principal identity must be an object')
  }
  const principal = {
    tenantId: opaque(identity.tenantId, 'tenantId'),
    principalId: opaque(identity.principalId, 'principalId'),
  }
  principalContexts.add(principal)
  return Object.freeze(principal) as PrincipalContext
}

export function assertPrincipalContext(value: unknown): asserts value is PrincipalContext {
  if (typeof value !== 'object' || value === null || !principalContexts.has(value)) {
    throw new ValidationError('a server-established PrincipalContext is required')
  }
}

export function parseAgentId(value: unknown): AgentId {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ValidationError('agentId must be a UUID')
  return value as AgentId
}

export function createAgentId(): AgentId {
  return randomUUID() as AgentId
}

export function createInternalSessionId(): string {
  return `dsh-mt-${randomUUID()}`
}

export function validateCreateAgentOptions(value: CreateAgentOptions | undefined): CreateAgentOptions {
  if (value === undefined) return Object.freeze({})
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Agent options must be an object')
  }
  allowKeys(value, ['agentOptions', 'meta'], 'Agent options')
  const agentOptions = Reflect.get(value, 'agentOptions') as CreateAgentOptions['agentOptions']
  let normalizedAgentOptions: NonNullable<CreateAgentOptions['agentOptions']> | undefined
  if (agentOptions !== undefined) {
    if (typeof agentOptions !== 'object' || agentOptions === null || Array.isArray(agentOptions)) {
      throw new ValidationError('agentOptions must be an object')
    }
    allowKeys(agentOptions, ['provider', 'model', 'reasoningEffort', 'maxTokens'], 'agentOptions')
    const provider = agentOptions.provider === undefined
      ? undefined
      : opaque(agentOptions.provider, 'agentOptions.provider')
    const model = agentOptions.model === undefined
      ? undefined
      : opaque(agentOptions.model, 'agentOptions.model')
    const reasoningEffort = agentOptions.reasoningEffort === undefined
      ? undefined
      : opaque(agentOptions.reasoningEffort, 'agentOptions.reasoningEffort')
    if (agentOptions.maxTokens !== undefined
      && (!Number.isSafeInteger(agentOptions.maxTokens) || agentOptions.maxTokens <= 0)) {
      throw new ValidationError('agentOptions.maxTokens must be a positive integer')
    }
    normalizedAgentOptions = Object.freeze({
      ...(provider === undefined ? {} : { provider }),
      ...(model === undefined ? {} : { model }),
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      ...(agentOptions.maxTokens === undefined ? {} : { maxTokens: agentOptions.maxTokens }),
    })
  }
  const meta = Reflect.get(value, 'meta') as CreateAgentOptions['meta']
  let normalizedMeta: NonNullable<CreateAgentOptions['meta']> | undefined
  if (meta !== undefined) {
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
      throw new ValidationError('meta must be an object')
    }
    allowKeys(meta, ['cwd', 'agentPreset'], 'meta')
    const cwd = meta.cwd === undefined ? undefined : opaque(meta.cwd, 'meta.cwd')
    const agentPreset = meta.agentPreset === undefined
      ? undefined
      : opaque(meta.agentPreset, 'meta.agentPreset')
    normalizedMeta = Object.freeze({
      ...(cwd === undefined ? {} : { cwd }),
      ...(agentPreset === undefined ? {} : { agentPreset }),
    })
  }
  return Object.freeze({
    ...(normalizedAgentOptions === undefined ? {} : { agentOptions: normalizedAgentOptions }),
    ...(normalizedMeta === undefined ? {} : { meta: normalizedMeta }),
  })
}
