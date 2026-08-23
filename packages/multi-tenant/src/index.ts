/**
 * dsh-multi-tenant — context-native multi-tenant runtime and v0.3 SaaS
 * Framework Core primitives for DeepSeek Harness.
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
  defineCapability,
  assertCapabilityToken,
  provideCapability,
  getCapability,
} from './capability.ts'
export type {
  CapabilityScope,
  CapabilityToken,
  CapabilityValue,
} from './capability.ts'

export {
  TenantRuntimeService,
  MultiTenantRuntimeError,
  RuntimeDefinitionConflictError,
  RuntimeRegistryClosedError,
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

export {
  PrincipalOperationError,
  OperationRegistryClosedError,
  OperationDependencyUnavailableError,
  OperationCancelledError,
} from './operation.ts'
export type {
  PrincipalOperationState,
  PrincipalOperationIdentity,
  OperationScopeSetupCommit,
  OperationScopePreparation,
  OperationScopeSetup,
  OperationScopeDefinition,
  OperationCapabilitySnapshot,
  PrincipalOperationExecution,
  PrincipalOperationDefinition,
  PrincipalOperation,
  PrincipalOperationRegistry,
} from './operation.ts'

export {
  compileSaaSDefinition,
  bootstrapDeploymentComposition,
  tenantDefinitionFromPlan,
  principalDefinitionFromPlan,
  operationDefinitionFromPlan,
  CompositionError,
  DuplicateCapabilityError,
  DuplicateProviderDefinitionError,
  UnknownCapabilityError,
  MissingCapabilityProviderError,
  AmbiguousCapabilityProviderError,
  InvalidProviderSelectionError,
  CapabilityScopeMismatchError,
  CapabilityDependencyError,
  CapabilityDependencyVisibilityError,
  CapabilityDependencyCycleError,
  CapabilityProviderUnavailableError,
} from './composition.ts'
export type {
  CapabilityDefinition,
  CapabilityProviderSetupCommit,
  CapabilityProviderPreparation,
  CapabilityProviderSetup,
  CapabilityProviderDefinition,
  CapabilityProviderSelection,
  SaaSDefinition,
  PlannedCapability,
  PlannedProvider,
  CompositionScopeFingerprints,
  CompositionPlan,
  DeploymentComposition,
} from './composition.ts'

export { TenantSessionStore, InMemoryTenantSessionStore } from './store.ts'
export type { TenantPrincipal, SessionOwner, ClaimResult } from './types.ts'
export {
  MultiTenantError,
  SessionAccessDeniedError,
  SessionOwnershipConflictError,
  ValidationError,
} from './errors.ts'
