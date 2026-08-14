/**
 * Development / bootstrap session-ownership store.
 *
 * Backed by a process-local `Map` and lost on restart. This is NOT production
 * persistence — it exists so the core contract can be exercised now, and so a
 * durable store (PostgreSQL / MySQL / Redis / remote authority) can be swapped
 * in behind the same {@link TenantSessionStore} seam later.
 *
 * `claim` is atomic within a single JavaScript turn: the read and the write
 * happen synchronously inside one async function body with no `await` between
 * them, so there is no interleaving point for another claim to slip through.
 * A durable implementation must preserve this atomicity (e.g. a unique
 * `session_id` constraint with `INSERT … ON CONFLICT`).
 *
 * @module dsh-multi-tenant/store
 */

import type { ClaimResult, SessionOwner, TenantSessionStore } from './types.ts'

export class InMemoryTenantSessionStore implements TenantSessionStore {
  private readonly owners = new Map<string, SessionOwner>()

  async claim(sessionId: string, owner: SessionOwner): Promise<ClaimResult> {
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

  async get(sessionId: string): Promise<SessionOwner | undefined> {
    const owner = this.owners.get(sessionId)
    return owner ? { tenantId: owner.tenantId, userId: owner.userId } : undefined
  }

  async release(sessionId: string): Promise<void> {
    this.owners.delete(sessionId)
  }
}
