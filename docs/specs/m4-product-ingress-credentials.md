[简体中文](./m4-product-ingress-credentials.zh-CN.md) | English

# Spec — M4 Product Ingress and Principal Credentials

> Status: implemented v0.3 Core contract.

## Product Ingress Boundary

Authentication happens before this framework trusts identity. HTTP cookies, JWT/OAuth/OIDC/SAML, service credentials, queue metadata and other protocol mechanisms remain product concerns.

Core starts with an already trusted subject:

```text
trusted product subject
  -> ProductIdentityResolver
  -> validate TenantPrincipal
  -> bound RuntimeComposition.principal()
  -> ComposedPrincipal
```

`createProductIngress()` owns no vendor authentication state and never parses a token. Invalid resolved identity fails before canonical Runtime selection.

## Principal Credentials

`principalCredentials` is the first concrete product-facing Runtime capability:

```text
CapabilityToken<PrincipalCredentials, 'principal'>
```

Its stable service key, semantic value type and Principal authority are one token. Materialization uses the normal composition provider contract and Cordis Principal scope.

The minimal contract is deliberately small:

```ts
interface PrincipalCredentials {
  get(name: string): Promise<string | undefined>
  require(name: string): Promise<string>
}
```

It does not expose enumeration, serialization or a universal secret-store API.

## Provider adapter

`definePrincipalCredentialsProvider()` receives the resolved Principal and AbortSignal inside Principal setup. A conforming provider may source credentials from any implementation; Core only requires a `PrincipalCredentials` value to be materialized in the correct scope.

The included `InMemoryPrincipalCredentials` is reference/test infrastructure only. Production secret storage is a later provider concern.

## Required evidence

The M4 contract tests prove:

- trusted subject maps to the correct canonical Tenant/Principal;
- malformed identity fails before Runtime selection;
- Acme/Alice, Acme/Bob and Globex/Alice resolve distinct Principal credentials;
- the credentials service does not leak to the Tenant parent;
- missing credential fails explicitly;
- replacing the credentials provider changes behavior without modifying Framework Core;
- RuntimeComposition disposal recreates a clean Principal/provider lifecycle.

## Security boundary

Credentials isolation here is trusted same-process Cordis scope isolation. A malicious plugin with arbitrary same-process/process/filesystem access is outside this guarantee; strong isolation remains a deployment boundary.
