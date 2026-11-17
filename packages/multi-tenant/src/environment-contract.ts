/** Exact Connector contract; identity admission preserves wire strings. */
export type {
  TenantId, PrincipalId, AllocationKey, EnvironmentNamespace, SandboxUID, PVCUID, PodUID, ResourceVersion,
  AgentEnvironmentRuntime,
  EnvironmentRuntimeOptions,
  EnvironmentOwner,
  EnvironmentIntent,
  EnvironmentRef,
  EnvironmentContext,
  EnvironmentView,
  EnvironmentState,
  EnvironmentConnection,
  EnvironmentMutation,
  EnvironmentDeletion,
  EnvironmentFailure,
} from '@dsh/environment-connector-internal'
export { EnvironmentError } from '@dsh/environment-connector-internal'

export { identities, parseEnvironmentOwner, parseEnvironmentIntent, parseEnvironmentRef, parseEnvironmentRuntimeOptions } from '@dsh/environment-connector-internal'
