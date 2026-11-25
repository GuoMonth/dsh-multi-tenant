/** Trusted platform APIs. Never expose bindings or control to a user workload. */
export {
  ENVIRONMENT_CONTRACT_VERSION, EnvironmentError, identities, parseEnvironmentOwner, parseEnvironmentIntent, parseEnvironmentRef,
} from './environment-contract.ts'
export type {
  TenantId, PrincipalId, AllocationKey, EnvironmentNamespace, SandboxUID, PVCUID, PodUID, ResourceVersion,
  AgentEnvironmentRuntime, EnvironmentOwner, EnvironmentIntent, EnvironmentRef, EnvironmentContext,
  EnvironmentView, EnvironmentState, EnvironmentConnection, EnvironmentMutation, EnvironmentDeletion,
  EnvironmentErrorCode, EnvironmentFailure,
} from './environment-contract.ts'
export { createPlatformApplication } from './platform/application.ts'
export { parsePlatformConfiguration, type PlatformConfiguration } from './platform/configuration.ts'
export { parseEnvironmentRuntimeOptions, type EnvironmentRuntimeOptions } from './platform/kubernetes-options.ts'
export { EnvironmentBindingStore } from './platform/bindings.ts'
export type {
  EnvironmentBinding,
  EnvironmentDefinition,
} from './platform/bindings.ts'
export { createEnvironmentControl } from './platform/control.ts'
export { createPlatformIngress } from './platform/ingress.ts'
export type {
  Environment,
  PlatformAuthenticator,
  AuthorizedSession,
} from './platform/ingress.ts'
export { createOIDCAuthentication } from './platform/oidc.ts'
export type { OIDCOptions } from './platform/oidc.ts'
export type { Member } from './platform/sessions.ts'
export const DSH_RUNTIME_VERSION = '0.2.2-rc.5'

export { environmentId } from './platform/identity.ts'
export type { EnvironmentId } from './platform/identity.ts'
