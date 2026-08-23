/**
 * dsh-multi-tenant — context-native multi-tenant runtime for DeepSeek Harness.
 *
 * v0.2 keeps the v0.1 immutable session-ownership kernel and adds a canonical,
 * transactionally published Tenant -> Principal runtime tree.
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
  RuntimeDefinitionConflictError,
  runtimeIdentityOf,
  tenantIdOf,
  principalOf,
} from './runtime.ts'
export type {
  TenantIdentity,
  RuntimeContextIdentity,
  RuntimeScopeState,
  RuntimeScopeSetupCommit,
  RuntimeScopePreparation,
  RuntimeScopeSetup,
  RuntimeScopeDefinition,
  RuntimeScope,
  RuntimeScopeRegistry,
  TenantRuntimeScope,
  PrincipalRuntimeScope,
  TenantScopeDefinition,
  PrincipalScopeDefinition,
} from './runtime.ts'

export { TenantSessionStore, InMemoryTenantSessionStore } from './store.ts'
export type { TenantPrincipal, SessionOwner, ClaimResult } from './types.ts'
export {
  MultiTenantError,
  SessionAccessDeniedError,
  SessionOwnershipConflictError,
  ValidationError,
} from './errors.ts'
