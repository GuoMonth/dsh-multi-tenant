/**
 * dsh-multi-tenant — Multi-tenant SaaS extension for DeepSeek Harness (DSH).
 *
 * Exposes two Cordis services:
 *   - `ctx.tenantSessionStore` — the ownership-storage seam (abstract), with
 *     the in-memory backend as the default provider.
 *   - `ctx.multiTenant` — the session-ownership + authorization service.
 *
 * Public surface is deliberately small. Internal diagnostic types
 * (access-denial reasons, decisions) are not re-exported.
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

export { TenantSessionStore, InMemoryTenantSessionStore } from './store.ts'
export type { TenantPrincipal, SessionOwner, ClaimResult } from './types.ts'
export {
  MultiTenantError,
  SessionAccessDeniedError,
  SessionOwnershipConflictError,
  ValidationError,
} from './errors.ts'
