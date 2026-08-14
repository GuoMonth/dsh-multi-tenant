/**
 * Tenant-session-store service seam (`ctx.tenantSessionStore`).
 *
 * Ownership is claim-once and immutable: there is deliberately NO release /
 * delete in the v0 contract. DSH session-lifecycle cleanup (actually ending a
 * session) is a separate concern to be designed against DSH's real Session
 * lifecycle later — it is not exposed here as an unconditional hazard.
 *
 * @module dsh-multi-tenant/store
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { ClaimResult, SessionOwner } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantSessionStore: TenantSessionStore
  }
}

/**
 * The ownership-storage seam. Backends store the tenant/user that claimed each
 * opaque session id. `claim` MUST be atomic — a single operation, not a
 * get-then-set — so a durable backend can map it to `INSERT … ON CONFLICT`
 * over a unique `session_id`. A future durable backend replaces the provider
 * of this service without touching `MultiTenantService`.
 */
export abstract class TenantSessionStore extends Service {
  constructor(ctx: Context) {
    super(ctx, 'tenantSessionStore')
  }

  abstract claim(sessionId: string, owner: SessionOwner): Promise<ClaimResult>
  abstract get(sessionId: string): Promise<SessionOwner | undefined>
}

/**
 * Development / bootstrap backend backed by a process-local `Map`.
 *
 * `claim` is atomic within a single JavaScript turn: the read and the write
 * happen synchronously inside one async function body with no `await` between
 * them, so no other claim can interleave. Lost on restart; NOT production
 * persistence.
 */
export class InMemoryTenantSessionStore extends TenantSessionStore {
  private readonly owners = new Map<string, SessionOwner>()

  constructor(ctx: Context) {
    super(ctx)
  }

  override async claim(sessionId: string, owner: SessionOwner): Promise<ClaimResult> {
    const existing = this.owners.get(sessionId)
    if (!existing) {
      this.owners.set(sessionId, { tenantId: owner.tenantId, userId: owner.userId })
      return 'created'
    }
    if (existing.tenantId === owner.tenantId && existing.userId === owner.userId) {
      return 'idempotent'
    }
    return 'conflict'
  }

  override async get(sessionId: string): Promise<SessionOwner | undefined> {
    const owner = this.owners.get(sessionId)
    return owner ? { tenantId: owner.tenantId, userId: owner.userId } : undefined
  }
}

export default InMemoryTenantSessionStore
