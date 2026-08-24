[简体中文](./saas-composition.zh-CN.md) | English

# Spec — SaaS Composition

> Status: live v0.3 compiler/materialization contract.

## Pipeline

```text
SaaSDefinition                  mutable product intent
      ↓ compile
CompositionPlan                 normalized / deterministic / immutable
      ↓ materialize
RuntimeComposition              exact bound product Runtime
      ↓
Tenant -> Principal -> Operation
```

The compiler owns provider selection, dependency validation, scope visibility and deterministic bootstrap order. Cordis owns service resolution and lifecycle.

## Capability identity

Every declared capability uses `CapabilityToken<T, Scope>` so key/type/scope cannot drift independently.

Provider dependencies reference tokens, not untyped strings. The compiler rejects:

- duplicate/unknown capabilities;
- missing required providers;
- ambiguous selection;
- token scope mismatch;
- descendant dependency visibility violations;
- cycles;
- non-deployment ambient providers pretending to own a scoped capability.

## Immutable Plan

`compileSaaSDefinition()` sorts/normalizes equivalent input into an immutable Plan with:

- selected capabilities/providers;
- deterministic `bootstrapOrder`;
- whole `fingerprint`;
- per-scope `scopeFingerprints`.

Callback object identity is intentionally not fingerprinted. Provider semantic configuration that affects creation must be represented by stable `definitionKey` metadata.

## Global identity vs canonical local identity

```text
plan.fingerprint
  exact whole Plan identity / RuntimeComposition attestation

plan.scopeFingerprints[scope]
  that scope's selected provider dependency closure
```

A scope fingerprint includes providers owned at that scope plus selected ancestor providers they actually depend on. Unrelated descendants are excluded.

Consequences:

- Operation-only change -> Operation fingerprint changes, Tenant/Principal may stay stable;
- Principal-only change -> Principal changes, unrelated Tenant stays stable;
- changed Deployment dependency used by Tenant/Principal -> dependent scope fingerprints change.

## Materialization

Low-level helpers remain available:

```text
bootstrapDeploymentComposition(plan)
tenantDefinitionFromPlan(plan)
principalDefinitionFromPlan(plan)
operationDefinitionFromPlan(plan)
```

They are framework primitives, not the preferred product composition surface.

Product code should use:

```ts
const runtime = await materializeRuntimeComposition(ctx, plan)
const principal = await runtime.principal({ tenantId, userId })
```

`RuntimeComposition` binds the exact whole Plan and removes Plan parameters from downstream Tenant/Principal/Operation creation. A different active whole Plan on the same root fails rather than consuming whatever same-key service happens to exist.

## Provider setup and publication

For each scope, selected providers execute in topological order. Required dependencies must already resolve in the scoped Context. Managed provider setup may return synchronous `{ commit() }`; commits run only after preparation succeeds.

Tenant/Principal creation remains unpublished until setup succeeds. Operation setup occurs before its one-shot capability snapshot.

## Bound Operation requirements

A product-facing composed Principal can request only capability tokens declared by its Plan. This prevents the bound path from reaching ambient same-key capabilities that are outside the intended composition.

## Non-goals

- second DI/provider container;
- deep-cloning capability values;
- arbitrary active-plan hot mutation;
- using package names as capability scopes;
- inventing MCP/Auth package topology before implementation proves it.
