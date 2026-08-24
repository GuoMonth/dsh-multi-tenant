[简体中文](./product-ingress-credentials.zh-CN.md) | English

# Spec — Product Ingress and Principal Credentials

> Status: implemented `0.3` contract.

## Product Ingress boundary

Authentication happens before this framework trusts identity. Cookies, JWT/OAuth/OIDC/SAML, service credentials, queue metadata and other protocol mechanisms remain product concerns.

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

`principalCredentials` is the current concrete Principal-scoped credential capability:

```text
CapabilityToken<PrincipalCredentials, 'principal'>
```

The minimal contract stays intentionally small:

```ts
interface PrincipalCredentials {
  get(name: string): Promise<string | undefined>
  require(name: string): Promise<string>
}
```

It does not expose enumeration, serialization or a universal secret-store API.

This is deliberately a **low-level `0.3` primitive**, not a promise that Agent/application code should permanently receive raw credentials. The current MCP integration resolves credential bindings inside trusted Agent setup plumbing. A later evidence-driven design may place credential access behind an authority/Broker plugin and expose service-specific typed clients/transports instead.

See `../vision/authority-capabilities.md`.

## Provider adapter

`definePrincipalCredentialsProvider()` receives the resolved Principal and AbortSignal inside Principal setup. A provider may source credentials from any implementation; Core only requires the capability to materialize in the correct Principal scope.

`InMemoryPrincipalCredentials` is reference/test infrastructure only, not a production secret store.

## Required evidence

The contract tests prove trusted subject mapping, malformed identity rejection, sibling/cross-Tenant credential isolation, no Tenant-parent leakage, explicit missing-credential failure, provider replacement, and clean recreation after RuntimeComposition disposal.

## Security boundary

Credential isolation here is trusted same-process Cordis scope isolation. Malicious code with arbitrary same-process/process/filesystem access is outside this guarantee; strong isolation remains a deployment concern.
