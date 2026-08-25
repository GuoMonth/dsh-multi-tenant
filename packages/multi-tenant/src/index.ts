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

export {
  materializeRuntimeComposition,
  RuntimeCompositionError,
  RuntimeCompositionConflictError,
  RuntimeCompositionClosedError,
  RuntimeCompositionCapabilityError,
} from './runtime-composition.ts'
export type {
  RuntimeCompositionAttestation,
  RuntimeCompositionOperationDefinition,
  ComposedOperationRegistry,
  ComposedPrincipal,
  ComposedPrincipalRegistry,
  ComposedTenant,
  ComposedTenantRegistry,
  RuntimeComposition,
} from './runtime-composition.ts'

export { createProductIngress } from './ingress.ts'
export type { ProductIdentityResolver, ProductIngress } from './ingress.ts'

export {
  principalCredentials,
  InMemoryPrincipalCredentials,
  CredentialUnavailableError,
  definePrincipalCredentialsProvider,
} from './credentials.ts'
export type {
  PrincipalCredentials,
  PrincipalCredentialsFactoryPreparation,
  PrincipalCredentialsProviderOptions,
} from './credentials.ts'

export {
  tenantMcpConfig,
  normalizeTenantMcpConfig,
  defineTenantMcpConfigProvider,
  runtimeMcpServerName,
  createMcpAgentIntegration,
  McpIntegrationError,
  McpIntegrationDependencyError,
  McpAgentServiceUnavailableError,
} from './mcp.ts'
export type {
  McpCredentialBinding,
  McpReconnectConfig,
  TenantMcpStdioServer,
  TenantMcpHttpServer,
  TenantMcpServer,
  TenantMcpConfig,
  TenantMcpConfigFactoryPreparation,
  TenantMcpConfigProviderOptions,
  McpAgentOptions,
  McpAgentCreateMeta,
  McpAgentSetupCommit,
  McpAgentSetup,
  McpAgentCreateOptions,
  McpAgentResumeOptions,
  McpRuntimeServer,
  McpAgentLike,
  McpAgentHandle,
  McpAgentIntegration,
} from './mcp.ts'

export { createMcpSaaSRuntime } from './product.ts'
export type {
  McpSaaSTenantMcpOptions,
  McpSaaSCredentialsOptions,
  McpSaaSRuntimeOptions,
  McpSaaSPrincipal,
  McpSaaSRuntime,
} from './product.ts'

export {
  mountMcpSaaSWebBridge,
  readBearerToken,
  readCookie,
} from './web.ts'
export type {
  TrustedWebSubjectResolver,
  McpSaaSWebBridgeOptions,
  McpSaaSWebBridge,
} from './web.ts'

export {
  ProductExperienceError,
  productExperienceError,
  toProductDiagnostic,
} from './diagnostics.ts'
export type {
  ProductExperienceStage,
  ProductExperienceErrorCode,
  ProductDiagnostic,
} from './diagnostics.ts'

export { TenantSessionStore, InMemoryTenantSessionStore } from './store.ts'
export type { TenantPrincipal, SessionOwner, ClaimResult } from './types.ts'
export {
  MultiTenantError,
  SessionAccessDeniedError,
  SessionOwnershipConflictError,
  ValidationError,
} from './errors.ts'
