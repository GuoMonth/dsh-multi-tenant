/**
 * dsh-multi-tenant — Multi-tenant SaaS extension for DeepSeek Harness (DSH).
 *
 * Exposes one Cordis service, `ctx.multiTenant`, that owns session ownership
 * and fail-closed authorization. Public surface is deliberately small: the
 * service, the identity/ownership types, the storage seam, and the errors.
 * Internal diagnostic types (access-denial reasons, decisions) are not
 * re-exported.
 *
 * @module dsh-multi-tenant
 */

import { MultiTenantService } from './service.ts'

// Augment the Cordis context so consumers can type `ctx.multiTenant`.
declare module '@deepseek-ai/cordis' {
  interface Context {
    multiTenant: MultiTenantService
  }
}

export { MultiTenantService }
export default MultiTenantService

export type { TenantPrincipal, SessionOwner, TenantSessionStore, ClaimResult } from './types.ts'
export { InMemoryTenantSessionStore } from './store.ts'
export {
  MultiTenantError,
  SessionAccessDeniedError,
  SessionOwnershipConflictError,
  ValidationError,
} from './errors.ts'
