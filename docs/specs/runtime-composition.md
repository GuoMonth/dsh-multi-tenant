[简体中文](./runtime-composition.zh-CN.md) | English

# Spec — RuntimeComposition Binding and Attestation

> Status: live `0.3` product-facing composition contract.

## Problem

A `CompositionPlan` can derive Deployment/Tenant/Principal/Operation definitions, but those low-level helpers are intentionally independent primitives. Product code must not accidentally materialize Deployment from Plan A, Tenant from Plan B and Operation from Plan C merely because individual capability keys happen to resolve.

Scope-local fingerprints solve canonical creation locality; they do not by themselves prove that one product request path is using one whole Plan.

## Contract

`materializeRuntimeComposition(root, plan)` creates the product-facing binding:

```text
CompositionPlan
   │ exact plan fingerprint
   ▼
RuntimeComposition
   ├─ Deployment materialization
   ├─ canonical Tenant joins
   ├─ canonical Principal joins
   └─ bound one-shot Operations
```

The exact `plan.fingerprint` is the **whole-plan attestation** boundary for one active product Runtime.

One root Context has at most one active exact RuntimeComposition:

- same `plan.fingerprint` joins/single-flights;
- a different active whole-plan fingerprint throws `RuntimeCompositionConflictError`;
- after quiescent disposal a new Plan may materialize on the same root.

## Attestation vs canonical identity

```text
plan.fingerprint
  whole product composition attestation

plan.scopeFingerprints.tenant / principal
  canonical creation identity for that Runtime scope
```

An Operation-only change may leave Tenant/Principal scope fingerprints unchanged, which is correct. But it is still a different whole product Plan and cannot silently join an already active product-facing `RuntimeComposition`.

## Bound handles

`ComposedTenant` and `ComposedPrincipal` carry the same immutable `RuntimeCompositionAttestation`. Their creation APIs do not accept another Plan/definition.

A bound Principal Operation accepts only:

- `requires`;
- `execute`.

Operation-local provider setup/isolation comes from the bound Plan. Requested capabilities must also be declared by that Plan; otherwise `RuntimeCompositionCapabilityError` fails before semantic work starts.

Low-level Runtime and `*DefinitionFromPlan()` helpers remain available for framework/integration work, but product code should prefer the bound `RuntimeComposition` surface.

## Lifecycle

`RuntimeComposition` owns deployment composition and every Tenant it exposes. Disposal order is:

```text
close composition admission
  -> dispose touched Tenants
      -> drain Principals
          -> cancel/drain Operations
  -> dispose Deployment composition
  -> release root binding
```

This prevents deployment capabilities from being torn down while a bound product Operation is still active.

## Non-goals

- hot mutation of an active Plan;
- multiple independent product compositions sharing one root Runtime;
- replacing Cordis service resolution;
- turning attestation into an authorization decision;
- hostile-code isolation.
