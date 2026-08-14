/**
 * Error types for the multi-tenant core.
 *
 * @module dsh-multi-tenant/errors
 */

/** Base class for all multi-tenant errors. */
export class MultiTenantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/**
 * Public authorization denial.
 *
 * Deliberately uniform and non-enumerating: the message carries no session
 * existence, no owner tenant/user, and no internal reason. Unknown sessions,
 * tenant mismatches, and user mismatches all surface as this same error, so the
 * public API cannot be used to probe session existence or ownership.
 */
export class SessionAccessDeniedError extends MultiTenantError {
  constructor() {
    super('Access to session denied.')
  }
}

/**
 * Claim conflict: the session is already owned by another principal.
 *
 * The message does not reveal the existing owner's identity. This is thrown by
 * `claimSession` (a server-side operation), not by the authorization path.
 */
export class SessionOwnershipConflictError extends MultiTenantError {
  constructor() {
    super('Session is already owned.')
  }
}

/** Invalid principal / session input rejected at a runtime boundary. */
export class ValidationError extends MultiTenantError {
  constructor(message: string) {
    super(message)
  }
}
