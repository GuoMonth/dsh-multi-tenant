/**
 * In-memory, fail-closed session-ownership service.
 *
 * This is the BOOTSTRAP / DEVELOPMENT implementation. It is backed by a
 * process-local `Map` and is lost on restart; it is **not** production
 * persistence and **not**, by itself, a production security boundary. The
 * durable `TenantSessionStore` and the surrounding defense-in-depth layers are
 * on the roadmap (see README).
 *
 * @module dsh-multi-tenant/service
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import { MultiTenantError, SessionAccessDeniedError, UnknownSessionError } from './errors.ts'
import type {
  MultiTenantService as MultiTenantServiceContract,
  SessionOwner,
  TenantPrincipal,
} from './types.ts'

/** Internal result of an authorization decision. */
type AccessDecision =
  | { allowed: true }
  | { allowed: false; error: MultiTenantError }

/**
 * `ctx.multiTenant` — the multi-tenant session-ownership service.
 *
 * Load it as a standard Cordis plugin (`ctx.plugin(MultiTenantService)`), then
 * consume it as `ctx.multiTenant`.
 */
export class MultiTenantService extends Service implements MultiTenantServiceContract {
  /** sessionId (opaque) → recorded owner. */
  private readonly sessionOwners = new Map<string, SessionOwner>()

  constructor(ctx: Context) {
    super(ctx, 'multiTenant')
  }

  /**
   * Record that `sessionId` belongs to `principal`'s tenant/user.
   *
   * The caller is responsible for establishing `principal` from a server-side
   * authenticated identity. The service does not parse tenant identity out of
   * the session id, and does not trust a client-supplied tenant id: it only
   * stores what an authenticated boundary provides. Re-binding overwrites the
   * previous owner; a real reassignment path belongs to a future, gated API.
   */
  bindSession(sessionId: string, principal: TenantPrincipal): void {
    if (!sessionId) {
      throw new MultiTenantError('bindSession requires a non-empty sessionId')
    }
    this.sessionOwners.set(sessionId, {
      tenantId: principal.tenantId,
      userId: principal.userId,
    })
  }

  /** Return a copy of the recorded owner, or `undefined` if unknown. */
  getSessionOwner(sessionId: string): SessionOwner | undefined {
    const owner = this.sessionOwners.get(sessionId)
    return owner ? { tenantId: owner.tenantId, userId: owner.userId } : undefined
  }

  /** Fail-closed boolean authorization. Unknown session → `false`. */
  canAccessSession(principal: TenantPrincipal, sessionId: string): boolean {
    return this.resolveAccess(principal, sessionId).allowed
  }

  /** Authorization that throws `UnknownSessionError` / `SessionAccessDeniedError`. */
  assertSessionAccess(principal: TenantPrincipal, sessionId: string): void {
    const decision = this.resolveAccess(principal, sessionId)
    if (!decision.allowed) throw decision.error
  }

  /** Forget the ownership binding. Unknown id is a no-op. */
  unbindSession(sessionId: string): void {
    this.sessionOwners.delete(sessionId)
  }

  private resolveAccess(principal: TenantPrincipal, sessionId: string): AccessDecision {
    const owner = this.sessionOwners.get(sessionId)
    if (!owner) {
      return { allowed: false, error: new UnknownSessionError(sessionId) }
    }
    // The tenant boundary is unconditional: no role, present or future, may
    // cross it. This is what keeps two tenants of one shared runtime apart.
    if (principal.tenantId !== owner.tenantId) {
      return {
        allowed: false,
        error: new SessionAccessDeniedError(
          sessionId,
          `principal tenant "${principal.tenantId}" does not match session tenant "${owner.tenantId}"`,
        ),
      }
    }
    if (principal.userId === owner.userId) {
      return { allowed: true }
    }
    if (this.canElevatedAccess(principal, owner)) {
      return { allowed: true }
    }
    return {
      allowed: false,
      error: new SessionAccessDeniedError(
        sessionId,
        `user "${principal.userId}" is not the session owner and holds no elevated role`,
      ),
    }
  }

  /**
   * Extension point for tenant-admin / platform-admin elevation.
   *
   * The v0 core returns `false` by default: cross-user access is denied even
   * for admin roles, because a role-based elevation rule is a security
   * decision that belongs to a downstream tenant-aware authorization layer,
   * not a guess here. Subclass and override to grant cross-user access *within*
   * a tenant (e.g. `principal.roles.includes('tenant-admin')`). Cross-tenant
   * access is never elevated — the tenant boundary above is unconditional.
   */
  protected canElevatedAccess(_principal: TenantPrincipal, _owner: SessionOwner): boolean {
    return false
  }
}
