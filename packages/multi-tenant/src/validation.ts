/**
 * Runtime invariant validation for opaque identifiers and principals.
 *
 * TypeScript types are not a security boundary: a JS caller can pass an empty
 * or over-long string through a typed signature. These helpers reject such
 * input at the service boundary. They are internal — not part of the package's
 * public surface.
 *
 * @module dsh-multi-tenant/validation
 */

import { ValidationError } from './errors.ts'
import type { TenantPrincipal } from './types.ts'

export const MAX_IDENTIFIER_LENGTH = 256

/** An opaque identifier must be a non-empty, trimmed string of bounded length. */
function requireOpaqueId(value: unknown, label: string): void {
  if (typeof value !== 'string') {
    throw new ValidationError(`${label} must be a string`)
  }
  if (value.length === 0) {
    throw new ValidationError(`${label} must not be empty`)
  }
  if (value !== value.trim()) {
    throw new ValidationError(`${label} must not have surrounding whitespace`)
  }
  if (value.length > MAX_IDENTIFIER_LENGTH) {
    throw new ValidationError(`${label} exceeds ${MAX_IDENTIFIER_LENGTH} characters`)
  }
}

/** Reject an invalid `sessionId`. */
export function validateSessionId(sessionId: unknown): void {
  requireOpaqueId(sessionId, 'sessionId')
}

/** Reject an invalid opaque tenant identifier. */
export function validateTenantId(tenantId: unknown): void {
  requireOpaqueId(tenantId, 'tenantId')
}

/** Reject an invalid user identifier. */
export function validateUserId(userId: unknown): void {
  requireOpaqueId(userId, 'userId')
}

/** Reject a malformed minimal ownership principal. Extra policy fields are ignored. */
export function validateTenantPrincipal(principal: unknown): void {
  if (typeof principal !== 'object' || principal === null) {
    throw new ValidationError('principal must be an object')
  }
  const p = principal as TenantPrincipal
  validateTenantId(p.tenantId)
  validateUserId(p.userId)
}
