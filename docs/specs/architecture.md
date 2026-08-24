[简体中文](./architecture.zh-CN.md) | English

# Architecture

> Live authority for the current `0.3` Runtime / SaaS Agent foundation.

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
            ├─ typed Runtime capabilities
            ├─ one-shot Operation
            └─ Principal-owned DSH Agent
                 └─ native DSH integrations / MCP Tools
```

The architecture separates five concerns:

1. **Persistent authorization** — `TenantSessionStore` + `MultiTenantService` own immutable Session ownership.
2. **Product Ingress** — maps an already trusted product subject to `TenantPrincipal`; authentication protocols stay outside Core.
3. **Runtime composition** — `RuntimeComposition` binds one exact `CompositionPlan` to one active materialized product Runtime.
4. **Runtime capabilities / Operations** — Cordis Context/Fiber owns Deployment/Tenant/Principal/Operation capability lifecycles.
5. **Agent Integration** — turns trusted Runtime state into native DSH Agent/plugin composition.

Strong hostile-code isolation remains a deployment concern.

## Canonical Runtime ownership

The current structural invariant is:

```text
Root -> Tenant -> Principal
                   ├-> Operation
                   └-> DSH Agent
```

Tenant and Principal are canonical nodes. Canonical creation is transactional:

```text
reserve
  -> unpublished Cordis subtree
  -> setup
  -> optional synchronous commit
  -> publish
```

Preparing creation is cancellable. Teardown closes admission, cancels preparing work, drains published descendants and only then disposes the owner Fiber.

Durable Session ownership is shared authorization state; Context identity is composition metadata, never the authorization record itself.

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

Scope is real ownership, not a label. Non-deployment providers materialize inside their declared Cordis scope, and a parent-scoped provider cannot depend on descendant authority.

Cordis remains the only service resolver/registry. `CapabilityToken`, `provideCapability()` and `getCapability()` add typed semantics; they do not create a second DI system.

## Composition identity

`CompositionPlan` carries two identity levels:

```text
plan.fingerprint
  exact whole-plan product identity

scopeFingerprints[scope]
  selected provider dependency closure for one authority scope
```

Scope-local fingerprints prevent unrelated descendant evolution from invalidating canonical parents. Whole-plan attestation solves a different problem: one active product Runtime must not silently mix plans.

- scope-local fingerprint = canonical creation drift;
- whole-plan attestation = product Runtime composition integrity.

## One-shot Operation

Cordis `ctx.inject()` is dependency-reactive and may rerun when dependencies disappear/recover. That is correct for plugin lifecycle, not for one user transaction.

A Principal-owned Operation therefore:

1. creates an ephemeral child Fiber;
2. materializes Operation-scoped providers from the bound Plan;
3. captures required typed capabilities once;
4. invokes semantic `execute()` once;
5. drains deterministically.

Bound Operations may request only capabilities declared by their `RuntimeComposition` Plan.

The snapshot freezes capability selection, not arbitrary mutable object internals. Provider-owned clients/resources retain their own lifetime contract.

## Product Ingress and credentials

`createProductIngress()` starts after authentication:

```text
trusted subject -> resolver -> TenantPrincipal -> RuntimeComposition.principal()
```

`principalCredentials` is a Principal-scoped low-level capability. Production authentication and secret-store implementations remain product/provider concerns.

## MCP Agent boundary

The current DSH-native integration is explicit:

```text
TenantMcpConfig + PrincipalCredentials
  -> one-shot create/resume Operation
  -> Session authorization
  -> Principal Context
  -> DSH Agent setup(agentCtx)
  -> official @deepseek-ai/dsh-mcp-client
  -> Agent-scoped native MCP Tools
```

The short Operation owns the decision/snapshot. The long-lived Agent belongs to the Principal and is drained by Principal teardown.

Do not copy Cordis private isolation maps into `Agent.ctx`; do not create a parallel Agent or MCP registry.

## Security boundary

Guaranteed for conforming trusted same-process code:

- durable Session ownership checks;
- Tenant/Principal capability separation;
- deterministic composition, publication and teardown checks.

Not guaranteed:

- process-memory isolation;
- filesystem/shell/network isolation;
- protection from malicious same-process plugins.

Use process/container/Pod/sidecar/remote boundaries when the threat model needs stronger isolation.
