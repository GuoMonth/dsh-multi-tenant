/**
 * dsh-multi-tenant — Multi-tenant kernel primitives for DeepSeek Harness (DSH).
 *
 * Exposes two Cordis services:
 *   - `ctx.tenantSessionStore` — the replaceable ownership-storage seam.
 *   - `ctx.multiTenant` — claim-once session ownership and authorization.
 *
 * Public surface is deliberately small. Policy/RBAC concerns are not part of
 * this kernel contract.
 *
 * @module dsh-multi-tenant
 */

import { MultiTenantService } from './service.ts'

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
