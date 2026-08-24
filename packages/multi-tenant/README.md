# dsh-multi-tenant

Context-native multi-tenant Runtime and v0.3 SaaS Framework Core primitives for DeepSeek Harness.

> Published npm foundation: `0.2.0-rc.3`. The repository v0.3 line adds product-facing composition binding, ingress and credentials on top of that Runtime contract.

## Product-facing path

```text
trusted product subject
  -> Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> Principal Credentials
  -> one-shot Operation
  -> Agent Integration
  -> DSH
```

### 1. Compile and bind one Plan

```ts
const plan = compileSaaSDefinition(definition)
const app = await materializeRuntimeComposition(ctx, plan)
```

`RuntimeComposition` owns exact whole-plan attestation. The same Plan joins; a different active Plan on the same root throws `RuntimeCompositionConflictError`. Canonical Tenant/Principal drift still uses scope-local fingerprints.

### 2. Resolve a trusted product subject

```ts
const ingress = createProductIngress(app, subject => ({
  tenantId: subject.organization,
  userId: subject.account,
}))

const principal = await ingress.resolve(subject)
```

Authentication is outside Core. The resolver receives a subject the product already trusts.

### 3. Principal Credentials

```ts
const provider = definePrincipalCredentialsProvider({
  id: 'credentials',
  definitionKey: 'v1',
  create({ principal }) {
    return new InMemoryPrincipalCredentials({
      erpApiToken: loadTokenFor(principal),
    })
  },
})
```

`principalCredentials` is a canonical `CapabilityToken<PrincipalCredentials, 'principal'>`. It is isolated by Principal lifecycle and can be replaced without changing Framework Core. `InMemoryPrincipalCredentials` is reference/test infrastructure, not a production secret store.

### 4. One-shot work

```ts
const operation = principal.operations.start({
  requires: [principalCredentials],
  async execute({ capabilities }) {
    const credentials = capabilities.require(principalCredentials)
    return credentials.require('erpApiToken')
  },
})
```

Bound Operations get provider setup/isolation from the Plan and may not request undeclared capabilities.

## Low-level Runtime

The v0.2 APIs remain available under `dsh-multi-tenant/runtime`, `operation` and `composition` for framework/integration code. Product code should prefer `runtime-composition` so Deployment/Tenant/Principal/Operation recipes cannot be accidentally mixed across Plans.

## Guarantees

- claim-once immutable Session ownership and fail-closed access;
- canonical Tenant/Principal publication and quiescent teardown;
- typed capability scope/dependency validation;
- scope-local canonical fingerprints;
- exact whole-plan RuntimeComposition attestation;
- trusted ingress -> canonical Principal;
- Principal Credentials isolation/replacement;
- one-shot Operation semantics;
- pinned real-DSH create/resume/failure evidence.

## Public subpaths

```text
dsh-multi-tenant
dsh-multi-tenant/runtime
dsh-multi-tenant/operation
dsh-multi-tenant/composition
dsh-multi-tenant/runtime-composition
dsh-multi-tenant/ingress
dsh-multi-tenant/credentials
dsh-multi-tenant/store
dsh-multi-tenant/testing
```

## Security boundary

Cordis Context is trusted same-process isolation/composition, not a hostile-code sandbox. Strong filesystem/process/network/shell isolation belongs to container/Pod deployment architecture.

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

## Verify

```sh
pnpm release:check
```
