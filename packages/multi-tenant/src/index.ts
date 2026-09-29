/** Trusted platform APIs. Never expose bindings or control to a user workload. */
export * from "./environment-contract.js";
export { EnvironmentBindingStore } from "./platform/bindings.js";
export type {
  EnvironmentBinding,
  EnvironmentDefinition,
} from "./platform/bindings.js";
export { createEnvironmentControl } from "./platform/control.js";
export { createPlatformIngress } from "./platform/ingress.js";
export type {
  Environment,
  PlatformAuthenticator,
  AuthorizedSession,
} from "./platform/ingress.js";
export { createOIDCAuthentication } from "./platform/oidc.js";
export type { OIDCOptions } from "./platform/oidc.js";
export type { Member } from "./platform/sessions.js";
export const DSH_RUNTIME_VERSION = "0.2.0-rc.2";
