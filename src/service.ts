/**
 * The multi-tenant session-ownership service (`ctx.multiTenant`).
 *
 * Responsibility, in one sentence: given an authenticated {@link TenantPrincipal},
 * own and authorize access to opaque DSH session ids through a fail-closed,
 * durable-store-compatible ownership contract.
 *
 * The service is storage-agnostic: it consumes the `tenantSessionStore` service
 * seam (a separate Cordis Service provider) and never constructs or inspects a
 * backend itself. Ownership is claim-once and immutable; the tenant boundary is
 * unconditional and checked before any other consideration.
 *
 * @module dsh-multi-tenant/service
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import { MultiTenantError, SessionAccessDeniedError, SessionOwnershipConflictError } from './errors.ts'
import type { TenantSessionStore } from './store.ts'
import { validateSessionId, validateTenantPrincipal } from './validation.ts'
import type { AccessDecision, SessionOwner, TenantPrincipal } from './types.ts'

export class MultiTenantService extends Service {
  /** The ownership backend is provided by a separate Cordis service. */
  static inject = ['tenantSessionStore']

  constructor(ctx: Context) {
    super(ctx, 'multiTenant')
  }

  private get store(): TenantSessionStore {
    return this.ctx.tenantSessionStore
  }

  /**
   * Claim ownership of `sessionId` for `principal`, exactly once.
   *
   * - Unclaimed → establishes ownership and succeeds.
   * - Already claimed by the same tenant/user → idempotent success.
   * - Already claimed by a different tenant/user → {@link SessionOwnershipConflictError};
   *   the existing owner is never overwritten.
   *
   * There is deliberately no reassignment or release API: ownership is
   * immutable, and lifecycle cleanup belongs to a future Admin/Session-lifecycle
   * plane, not this core.
   */
  async claimSession(sessionId: string, principal: TenantPrincipal): Promise<void> {
    validateSessionId(sessionId)
    validateTenantPrincipal(principal)
    const owner: SessionOwner = { tenantId: principal.tenantId, userId: principal.userId }
    const result = await this.store.claim(sessionId, owner)
    switch (result) {
      case 'created':
      case 'idempotent':
        return
      case 'conflict':
        throw new SessionOwnershipConflictError()
      default:
        // Fail closed: a store result outside the ClaimResult contract must
        // never be treated as a successful claim.
        throw new MultiTenantError('tenant session store returned an invalid claim result')
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
