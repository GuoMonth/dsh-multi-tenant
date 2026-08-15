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
export const MAX_ROLE_COUNT = 32
export const MAX_ROLE_LENGTH = 64

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

/** Reject a malformed principal (empty/whitespace/over-long identity, bad roles). */
export function validateTenantPrincipal(principal: unknown): void {
  if (typeof principal !== 'object' || principal === null) {
    throw new ValidationError('principal must be an object')
  }
  const p = principal as TenantPrincipal
  requireOpaqueId(p.tenantId, 'tenantId')
  requireOpaqueId(p.userId, 'userId')

  if (!Array.isArray(p.roles)) {
    throw new ValidationError('roles must be an array')
  }
  if (p.roles.length > MAX_ROLE_COUNT) {
    throw new ValidationError(`roles exceeds ${MAX_ROLE_COUNT} entries`)
  }
  for (const role of p.roles) {
    if (typeof role !== 'string' || role.length === 0 || role !== role.trim()) {
      throw new ValidationError('roles must contain only non-empty strings without surrounding whitespace')
    }
    if (role.length > MAX_ROLE_LENGTH) {
      throw new ValidationError(`a role exceeds ${MAX_ROLE_LENGTH} characters`)
    }
  }
}
