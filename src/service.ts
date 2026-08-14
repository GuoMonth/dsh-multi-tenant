/**
 * The multi-tenant session-ownership service (`ctx.multiTenant`).
 *
 * Responsibility, in one sentence: given an authenticated {@link TenantPrincipal},
 * own and authorize access to opaque DSH session ids through a fail-closed,
 * durable-store-compatible ownership contract.
 *
 * The service is storage-agnostic: it depends only on {@link TenantSessionStore}
 * and never inspects the backing store. Ownership is claim-once (immutable); the
 * tenant boundary is unconditional and checked before any other consideration.
 *
 * @module dsh-multi-tenant/service
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import { SessionAccessDeniedError, SessionOwnershipConflictError } from './errors.ts'
import { InMemoryTenantSessionStore } from './store.ts'
import { validateSessionId, validateTenantPrincipal } from './validation.ts'
import type {
  AccessDecision,
  SessionOwner,
  TenantPrincipal,
  TenantSessionStore,
} from './types.ts'

export class MultiTenantService extends Service {
  private readonly store: TenantSessionStore

  /**
   * @param ctx — Cordis context (the service registers itself as `multiTenant`).
   * @param store — ownership store; defaults to an in-memory bootstrap store.
   *   Inject a durable `TenantSessionStore` for production.
   */
  constructor(ctx: Context, store?: TenantSessionStore) {
    super(ctx, 'multiTenant')
    this.store = store ?? new InMemoryTenantSessionStore()
  }

  /**
   * Claim ownership of `sessionId` for `principal`, exactly once.
   *
   * - Unclaimed → establishes ownership and succeeds.
   * - Already claimed by the same tenant/user → idempotent success.
   * - Already claimed by a different tenant/user → {@link SessionOwnershipConflictError};
   *   the existing owner is never overwritten.
   *
   * There is deliberately no reassignment API: reassigning ownership is a
   * high-privilege admin operation that belongs to a future Admin Plane.
   */
  async claimSession(sessionId: string, principal: TenantPrincipal): Promise<void> {
    validateSessionId(sessionId)
    validateTenantPrincipal(principal)
    const owner: SessionOwner = { tenantId: principal.tenantId, userId: principal.userId }
    const result = await this.store.claim(sessionId, owner)
    if (result === 'conflict') {
      throw new SessionOwnershipConflictError()
    }
  }

  /**
   * Return the recorded owner, or `undefined` if unknown.
   *
   * This is a trusted-facing lookup (server components, audit, tests) and is
   * NOT a non-enumerating surface; the authorization methods are.
   */
  async getSessionOwner(sessionId: string): Promise<SessionOwner | undefined> {
    validateSessionId(sessionId)
    return this.store.get(sessionId)
  }

  /** Fail-closed boolean authorization. Unknown session → `false`. */
  async canAccessSession(principal: TenantPrincipal, sessionId: string): Promise<boolean> {
    return (await this.evaluateAccess(principal, sessionId)).allowed
  }

  /**
   * Authorization that throws on denial. The thrown {@link SessionAccessDeniedError}
   * is uniform: it does not distinguish an unknown session from a foreign one,
   * and it never carries owner tenant/user identity.
   */
  async assertSessionAccess(principal: TenantPrincipal, sessionId: string): Promise<void> {
    const decision = await this.evaluateAccess(principal, sessionId)
    if (!decision.allowed) {
      throw new SessionAccessDeniedError()
    }
  }

  /**
   * Release ownership of `sessionId`, but only for the current owner.
   *
   * A non-owner (different user, different tenant, or unknown session) is
   * denied — the same non-enumerating denial as `assertSessionAccess`. There is
   * no unconditional "delete someone else's ownership" API.
   */
  async releaseSession(sessionId: string, principal: TenantPrincipal): Promise<void> {
    validateSessionId(sessionId)
    validateTenantPrincipal(principal)
    const owner = await this.store.get(sessionId)
    if (!owner || owner.tenantId !== principal.tenantId || owner.userId !== principal.userId) {
      throw new SessionAccessDeniedError()
    }
    await this.store.release(sessionId)
  }

  /**
   * Internal authorization decision with a diagnostic reason.
   *
   * `protected` so tests, future audit, and observability can inspect the
   * reason. The PUBLIC API (`canAccessSession` / `assertSessionAccess`) never
   * exposes it — the reason is diagnostic, not a transport value.
   */
  protected async evaluateAccess(principal: TenantPrincipal, sessionId: string): Promise<AccessDecision> {
    validateSessionId(sessionId)
    validateTenantPrincipal(principal)
    const owner = await this.store.get(sessionId)
    if (!owner) {
      return { allowed: false, reason: 'UNKNOWN_SESSION' }
    }
    // The tenant boundary is unconditional and checked first: no role, present
    // or future, may cross it. Cross-tenant inspection is a separate Admin /
    // Audit Plane concern, not `canAccessSession`.
    if (owner.tenantId !== principal.tenantId) {
      return { allowed: false, reason: 'TENANT_MISMATCH' }
    }
    if (owner.userId !== principal.userId) {
      return { allowed: false, reason: 'USER_MISMATCH' }
    }
    return { allowed: true }
  }
}
