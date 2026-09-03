/** Principal-scoped persistence seam for plugin-owned Agent resources. */

import { Service, type Context } from '@deepseek-ai/cordis'
import { AgentRecordConflictError } from './errors.ts'
import type {
  AgentId,
  AgentRecordTransition,
  NewTenantAgentRecord,
  PrincipalIdentity,
  TenantAgentRecord,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantAgentRepository: TenantAgentRepository
  }
}

export abstract class TenantAgentRepository extends Service {
  constructor(ctx: Context) {
    super(ctx, 'tenantAgentRepository')
  }

  abstract insert(record: NewTenantAgentRecord): Promise<TenantAgentRecord>
  abstract get(principal: PrincipalIdentity, id: AgentId): Promise<TenantAgentRecord | undefined>
  abstract list(principal: PrincipalIdentity): Promise<readonly TenantAgentRecord[]>
  abstract transition(
    principal: PrincipalIdentity,
    id: AgentId,
    expectedRevision: number,
    transition: AgentRecordTransition,
  ): Promise<TenantAgentRecord | undefined>
}

export function assertLegalAgentRecordTransition(value: unknown): asserts value is AgentRecordTransition {
  if (typeof value === 'object' && value !== null) {
    const from = Reflect.get(value, 'from')
    const to = Reflect.get(value, 'to')
    if ((from === 'provisioning' && (to === 'ready' || to === 'failed'))
      || (from === 'ready' && (to === 'ready' || to === 'deleted'))) return
  }
  throw new TypeError('Illegal Agent record transition.')
}

function clone(record: TenantAgentRecord): TenantAgentRecord {
  return Object.freeze({
    ...record,
    mcpServers: Object.freeze([...record.mcpServers]),
  })
}

function initial(record: NewTenantAgentRecord): TenantAgentRecord {
  return clone({
    ...record,
    state: 'provisioning',
    revision: 0,
    updatedAt: record.createdAt,
  })
}

/**
 * Hermetic provider used by tests and explicitly ephemeral deployments.
 * Persistent replacements must finish topology-specific recovery before registration.
 */
export class InMemoryTenantAgentRepository extends TenantAgentRepository {
  private readonly records = new Map<AgentId, TenantAgentRecord>()
  private readonly sessions = new Set<string>()

  override async insert(record: NewTenantAgentRecord): Promise<TenantAgentRecord> {
    if (this.records.has(record.id) || this.sessions.has(record.sessionId)) {
      throw new AgentRecordConflictError()
    }
    const created = initial(record)
    this.records.set(created.id, created)
    this.sessions.add(created.sessionId)
    return clone(created)
  }

  override async get(principal: PrincipalIdentity, id: AgentId): Promise<TenantAgentRecord | undefined> {
    const record = this.records.get(id)
    if (record === undefined
      || record.tenantId !== principal.tenantId
      || record.principalId !== principal.principalId) return undefined
    return clone(record)
  }

  override async list(principal: PrincipalIdentity): Promise<readonly TenantAgentRecord[]> {
    return Object.freeze([...this.records.values()]
      .filter(record => record.tenantId === principal.tenantId && record.principalId === principal.principalId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map(clone))
  }

  override async transition(
    principal: PrincipalIdentity,
    id: AgentId,
    expectedRevision: number,
    transition: AgentRecordTransition,
  ): Promise<TenantAgentRecord | undefined> {
    assertLegalAgentRecordTransition(transition)
    const current = this.records.get(id)
    if (current === undefined
      || current.tenantId !== principal.tenantId
      || current.principalId !== principal.principalId
      || current.revision !== expectedRevision
      || current.state !== transition.from) return undefined
    const next = clone({
      ...current,
      state: transition.to,
      revision: current.revision + 1,
      updatedAt: transition.at,
      sessionId: transition.to === 'deleted' ? `deleted:${current.id}` : current.sessionId,
      capabilityRevision: transition.to === 'deleted'
        ? ''
        : transition.capabilityRevision ?? current.capabilityRevision,
      mcpServers: transition.to === 'deleted' ? Object.freeze([]) : transition.mcpServers ?? current.mcpServers,
      ...(transition.to === 'deleted' ? { deletedAt: transition.at } : {}),
    })
    this.records.set(id, next)
    return clone(next)
  }
}
