/** Stable, non-enumerating errors for the product boundary. */

export class MultiTenantError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = new.target.name
  }
}

export class ValidationError extends MultiTenantError {
  constructor(message: string, options?: ErrorOptions) {
    super('INVALID_INPUT', message, options)
  }
}

export class AuthenticationRequiredError extends MultiTenantError {
  constructor(options?: ErrorOptions) {
    super('AUTHENTICATION_REQUIRED', 'Authentication is required.', options)
  }
}

export class AgentNotFoundError extends MultiTenantError {
  constructor(options?: ErrorOptions) {
    super('AGENT_NOT_FOUND', 'Agent not found.', options)
  }
}

export class AgentRecordConflictError extends MultiTenantError {
  constructor(options?: ErrorOptions) {
    super('AGENT_RECORD_CONFLICT', 'Agent record conflict.', options)
  }
}

export class CapabilityUnavailableError extends MultiTenantError {
  constructor(message = 'A required Agent capability is unavailable.', options?: ErrorOptions) {
    super('CAPABILITY_UNAVAILABLE', message, options)
  }
}

export class IsolationUnavailableError extends MultiTenantError {
  constructor(options?: ErrorOptions) {
    super('ISOLATION_UNAVAILABLE', 'The configured runtime cannot satisfy the required isolation level.', options)
  }
}

export class AgentProvisioningError extends MultiTenantError {
  constructor(options?: ErrorOptions) {
    super('AGENT_PROVISIONING_FAILED', 'Agent provisioning failed.', options)
  }
}

export class ServiceClosedError extends MultiTenantError {
  constructor(options?: ErrorOptions) {
    super('SERVICE_CLOSED', 'The multi-tenant service is closed.', options)
  }
}
