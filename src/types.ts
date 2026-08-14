/**
 * Core multi-tenant identity and authorization types.
 *
 * These are the "seam" types shared by every future layer (HTTP auth, RPC
 * authorization, MCP credential pools). They are intentionally minimal: a
 * principal is an authenticated identity, and an owner is the subset of that
 * identity recorded against a session.
 *
 * @module dsh-multi-tenant/types
 */

/**
 * An authenticated caller identity, established by a server-side boundary.
 *
 * A `TenantPrincipal` is **never** assembled from client-supplied fields: the
 * authenticated request boundary derives it (e.g. from a verified session
 * token or an authenticated API key) and hands it to this service. The service
 * trusts the principal it is given, but does not trust a tenant id that
 * arrives out-of-band.
 */
export interface TenantPrincipal {
  /** Opaque tenant identifier. Server-derived; never parsed from a session id. */
  tenantId: string
  /** User identifier, unique within the tenant. */
  userId: string
  /** Roles the user holds within the tenant (e.g. `member`, `tenant-admin`). */
  roles: readonly string[]
}

/**
 * The recorded owner of a session.
 *
 * This is the minimal authorization binding: which tenant and user a session
 * belongs to. It is deliberately smaller than `TenantPrincipal` — roles are an
 * attribute of the *caller* at request time, not a property pinned to the
 * session.
 */
export interface SessionOwner {
  tenantId: string
  userId: string
}

/**
 * Public contract of the multi-tenant service (provided as `ctx.multiTenant`).
 *
 * The concrete implementation is `MultiTenantService` in `./service.ts`, which
 * extends Cordis `Service`. This interface exists so consumers can type
 * decorators, mocks, or a future durable `TenantSessionStore`-backed
 * implementation against the same surface.
 */
export interface MultiTenantService {
  /** Record `sessionId` as owned by `principal`'s tenant/user. */
  bindSession(sessionId: string, principal: TenantPrincipal): void
  /** Return the recorded owner, or `undefined` if the session is unknown. */
  getSessionOwner(sessionId: string): SessionOwner | undefined
  /** Fail-closed boolean: may `principal` access `sessionId`? */
  canAccessSession(principal: TenantPrincipal, sessionId: string): boolean
  /** Like `canAccessSession`, but throws a specific error on denial. */
  assertSessionAccess(principal: TenantPrincipal, sessionId: string): void
  /** Forget the ownership binding for `sessionId`. */
  unbindSession(sessionId: string): void
}
