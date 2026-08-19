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
 * The minimal authenticated identity required by the ownership kernel.
 *
 * A `TenantPrincipal` is established by a server-side authentication boundary;
 * it is never assembled from client-supplied tenant fields. Roles, permissions,
 * admin flags, and other policy attributes are deliberately NOT part of this
 * contract. If the ecosystem later needs same-tenant sharing or RBAC, that
 * belongs to a separate policy plane rather than the ownership identity.
 */
export interface TenantPrincipal {
  /** Opaque tenant identifier. Never parsed out of a session id. */
  tenantId: string
  /** User identifier, unique within the tenant. */
  userId: string
}

/**
 * The recorded owner of a session — the minimal authorization binding.
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

/** Internal authorization decision. */
export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: AccessDenialReason }
