/**
 * dsh-multi-tenant — context-native multi-tenant runtime for DeepSeek Harness.
 *
 * v0.2 keeps the v0.1 immutable session-ownership kernel and adds a Cordis
 * context-native tenant/principal capability runtime (`ctx.tenantRuntime`).
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

export {
  TenantRuntimeService,
  MultiTenantRuntimeError,
  tenantIdOf,
  principalOf,
} from './runtime.ts'
export type {
  TenantRuntimeScope,
  PrincipalRuntimeScope,
  TenantScopeOptions,
  PrincipalScopeOptions,
} from './runtime.ts'

export { TenantSessionStore, InMemoryTenantSessionStore } from './store.ts'
export type { TenantPrincipal, SessionOwner, ClaimResult } from './types.ts'
export {
  MultiTenantError,
  SessionAccessDeniedError,
  SessionOwnershipConflictError,
  ValidationError,
} from './errors.ts'
