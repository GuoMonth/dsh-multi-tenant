/**
 * Core multi-tenant identity, ownership, and decision types.
 *
 * Identifier semantics: `sessionId`, `tenantId`, and `userId` are all OPAQUE
 * strings. The core never parses structure out of them — no UUID or numeric-id
 * assumptions, no `tenantId:userId` join rules, no prefix-based authorization.
 * Identity is an exact-match on the authenticated value.
 *
 * @module dsh-multi-tenant/types
 */

/**
 * An authenticated caller identity, established by a server-side boundary.
 *
 * A `TenantPrincipal` is never assembled from client-supplied fields: the
 * authenticated transport derives it (verified session token, authenticated
 * API key, …) and hands it to this core. The core trusts the principal it is
 * given but never trusts a tenant id that arrives out-of-band.
 */
export interface TenantPrincipal {
  /** Opaque tenant identifier. Never parsed out of a session id. */
  tenantId: string
  /** User identifier, unique within the tenant. */
  userId: string
  /**
   * Roles the user holds within the tenant. Present for future authorization
   * layers; the v0 core does NOT consult roles for access — ownership only.
   */
  roles: readonly string[]
}

/**
 * The recorded owner of a session — the minimal authorization binding.
 *
 * Deliberately smaller than `TenantPrincipal`: roles are an attribute of the
 * *caller* at request time, not a property pinned to the session.
 */
export interface SessionOwner {
  tenantId: string
  userId: string
}

/**
 * Result of an atomic ownership claim.
 *
 * `claim` returns one of these; it never throws on a conflicting owner (the
 * service maps `'conflict'` to a public error). A plain discriminated string
 * keeps the seam from leaking the existing owner back to the caller.
 */
export type ClaimResult =
  | 'created'
  | 'idempotent'
  | 'conflict'

/**
 * Internal diagnostic reason for an access denial.
 *
 * This is an INTERNAL value for tests, audit, and observability. It is never
 * returned through the public authorization API, which deliberately collapses
 * all denials into a single non-enumerating error.
 */
export type AccessDenialReason =
  | 'UNKNOWN_SESSION'
  | 'TENANT_MISMATCH'
  | 'USER_MISMATCH'

/**
 * Internal authorization decision, as a discriminated union: an allowed
 * decision carries no reason, and a denial always carries one.
 */
export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: AccessDenialReason }
