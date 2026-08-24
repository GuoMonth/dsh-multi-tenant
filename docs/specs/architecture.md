[简体中文](./architecture.zh-CN.md) | English

# Architecture

> Live authority for the current `dsh-multi-tenant` Runtime/SaaS Core.

## Topology

```text
Product / Transport authentication
        ↓ trusted subject
Product Ingress Boundary
        ↓ TenantPrincipal
RuntimeComposition
        │ exact plan attestation
        ▼
TenantRuntimeService
  └─ canonical Tenant
       └─ canonical Principal
            └─ Principal-owned Operation
                 └─ Agent Integration
                      └─ DeepSeek Harness
```

The architecture deliberately separates five planes:

1. **Persistent authorization** — `TenantSessionStore` + `MultiTenantService` own immutable Session ownership.
2. **Product Ingress Boundary** — maps an already trusted product subject to `TenantPrincipal`; it does not parse authentication protocols.
3. **Runtime composition** — `RuntimeComposition` binds one exact `CompositionPlan` to one materialized product Runtime.
4. **Runtime capabilities / Operations** — Cordis Context/Fiber owns Deployment/Tenant/Principal/Operation capabilities and lifecycle.
5. **Agent Integration** — converts a trusted Operation view into native DSH Agent/Preset/plugin composition.

Strong hostile-code isolation remains a process/container/Pod concern.

## Canonical Runtime ownership

The v0.2 structural invariant remains:

```text
Root -> Tenant -> Principal -> Operation
```

Tenant and Principal are canonical nodes. Creation is transactional:

```text
reserve
  -> unpublished Cordis subtree
  -> setup
  -> optional synchronous commit
  -> publish
```

Preparing creation is cancellable state. Registry teardown closes admission, cancels preparing transactions, drains published children and only then disposes the owner Fiber.

The v0.1 ownership kernel remains shared across this tree. Context identity is composition metadata, never durable authorization.

## Typed capability authority

A Runtime capability is represented by `CapabilityToken<T, Scope>`:

```text
stable Cordis service key
+ semantic TypeScript value type
+ lifecycle / authority scope
```

Scopes are:

```text
deployment -> tenant -> principal -> operation
```

A scope is real authority, not metadata. Non-deployment providers must materialize their capability inside the corresponding Cordis scope. A parent-scoped provider cannot depend on a descendant-scoped capability.

Cordis remains the only service resolver/registry. `CapabilityToken`, `provideCapability()` and `getCapability()` are typed semantics over Cordis, not a second DI system.

## Composition identity

`CompositionPlan` carries two identity levels:

```text
plan.fingerprint
  exact whole-plan product identity

scopeFingerprints[scope]
  selected provider dependency closure for one authority scope
```

`scopeFingerprints[scope]` prevents unrelated descendant changes from invalidating parent canonical nodes. For example, an Operation-only provider revision does not change Tenant/Principal creation identity.

`RuntimeComposition` solves a different problem: one active product Runtime must not mix whole Plans. Same exact Plan joins; a different active whole-plan fingerprint on the same root fails.

This distinction is intentional:

- scope-local fingerprint = canonical creation drift;
- whole-plan attestation = product Runtime composition integrity.

## One-shot Operation

Cordis `ctx.inject()` is dependency-reactive. Losing/restoring a dependency may rerun the callback. That behavior is correct for plugin lifecycle and incorrect for one user transaction.

A Principal-owned Operation therefore:

1. creates an ephemeral child Fiber;
2. materializes Operation-scoped providers from the bound Plan;
3. captures required typed capabilities once;
4. invokes semantic `execute()` once;
5. drains its Fiber deterministically.

Bound product Operations may only request capabilities declared by their `RuntimeComposition` Plan.

The capability snapshot freezes selection, not arbitrary object internals. If a capability value is a mutable client/resource, its own lifetime contract remains the provider's responsibility. v0.3 does not promise arbitrary provider hot reconfiguration.

## Product Ingress and Credentials

`createProductIngress()` begins after authentication:

```text
trusted subject -> resolver -> TenantPrincipal -> RuntimeComposition.principal()
```

The first concrete product-facing Runtime capability is `principalCredentials`, a Principal-scoped `CapabilityToken<PrincipalCredentials, 'principal'>`. A provider is recreated/isolated with the Principal lifecycle and is consumed through the same Operation snapshot mechanism.

Vendor authentication and production secret-store implementations remain outside Core.

## Agent boundary

Runtime capability state does not automatically become Agent state. Agent Integration is explicit:

```text
Operation snapshot
  -> integration recipe
  -> ownerCtx.agents.create/resume
  -> DSH Agent setup(agentCtx)
  -> DSH-native tools/plugins/listeners
```

Do not copy Cordis private isolation maps into `Agent.ctx`; do not create a parallel Agent tenant registry.

## Security boundary

Guaranteed:

- durable Session ownership checks;
- trusted same-process Tenant/Principal capability isolation for conforming providers;
- deterministic lifecycle and composition checks.

Not guaranteed by this package:

- process-memory isolation;
- filesystem/shell/network isolation;
- protection from malicious same-process plugins;
- one-tenant-per-machine or one-tenant-per-Pod isolation.

Those belong to deployment architecture.
