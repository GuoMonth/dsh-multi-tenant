/**
 * Error types for the multi-tenant core.
 *
 * Denials are typed so callers can distinguish "this session does not exist"
 * (`UnknownSessionError`, which does not leak whether a session id is valid)
 * from "this principal may not access this session" (`SessionAccessDeniedError`).
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

/** Thrown when a session id has no recorded owner. */
export class UnknownSessionError extends MultiTenantError {
  constructor(readonly sessionId: string) {
    super(`Session "${sessionId}" has no recorded tenant owner`)
  }
}

/** Thrown when a principal is denied access to a session it may not use. */
export class SessionAccessDeniedError extends MultiTenantError {
  constructor(
    readonly sessionId: string,
    readonly reason?: string,
  ) {
    super(`Access to session "${sessionId}" denied${reason ? `: ${reason}` : ''}`)
  }
}
