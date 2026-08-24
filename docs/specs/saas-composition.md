[简体中文](./saas-composition.zh-CN.md) | English

# Spec — SaaS Composition Model

> Status: **implemented and hardened after v0.3 M1–M3**. The live model is protected by compiler tests, scope-local canonical-drift tests, packed-consumer smoke and the pinned-DSH vertical proof.

## Purpose

v0.2 owns canonical Tenant/Principal lifecycle. v0.3 adds the smallest SaaS semantics needed to answer:

- which typed capabilities constitute a composition;
- which provider is selected for each capability;
- which Runtime scope owns the capability;
- which selected capabilities it depends on;
- whether the graph is valid before traffic;
- whether a canonical Runtime node is already running a conflicting **local creation slice**.

It is deliberately **not** another DI container. Cordis continues to own service resolution, provider lifetime, Context isolation and Fiber cleanup.

## Three representations

```text
SaaSDefinition
  mutable intent
      ↓ compile
CompositionPlan
  normalized + deterministic + immutable
      ↓ materialize
Runtime Composition
  native Cordis providers in Deployment/Tenant/Principal/Operation scopes
```

## Typed capability identity

A capability is no longer represented by independent string/scope fields.

```ts
const credentials = defineCapability<Credentials, 'principal'>(
  'credentials',
  'principal',
)
```

`CapabilityToken<T, Scope>` binds:

```text
stable service key
+ semantic TypeScript value type
+ lifecycle / authority scope
```

The token is a typed identity over a Cordis service key. `provideCapability()` and `getCapability()` are thin typed facades over Cordis `ctx.provide()` / `ctx.get()`; they do not own storage or resolution.

This removes invalid states such as declaring the same capability as Tenant-scoped in one place and Principal-scoped in another, and removes consumer-side type assertions such as `require<MyType>('credentials')`.

## SaaSDefinition

Definitions contain capability tokens, provider candidates, optional selection and dependency edges:

```ts
interface CapabilityDefinition {
  capability: CapabilityToken
  required?: boolean
  defaultProvider?: string
}

interface CapabilityProviderDefinition {
  id: string
  capability: CapabilityToken
  requires?: readonly CapabilityToken[]
  definitionKey?: string
  setup?: CapabilityProviderSetup
}
```

Runtime code never repeatedly interprets the mutable Definition.

## CompositionPlan

The compiler resolves ambiguity before Runtime bootstrap. A Plan contains:

- normalized typed capability bindings;
- selected provider definitions;
- deterministic topological bootstrap order;
- a global structural `fingerprint` for exact whole-plan comparison and diagnostics;
- `scopeFingerprints` for Deployment/Tenant/Principal/Operation dependency closures.

Fingerprints exclude JavaScript callback object identity. Provider authors use stable provider IDs plus optional `definitionKey` when configuration changes the semantic creation recipe.

## Scope means real authority

Scopes are lifecycle/authority semantics:

```text
deployment -> tenant -> principal -> operation
```

- deployment — application/process-wide capability;
- tenant — owned by one canonical Tenant;
- principal — owned by one canonical Principal;
- operation — owned by one ephemeral Principal Operation.

A non-deployment provider must materialize inside its declared scope. Ambient externally mounted capabilities are deployment-only.

This prevents a declaration such as “principal credentials” from secretly resolving an inherited root service.

## Compile-time invariants

`compileSaaSDefinition()` fails before Runtime bootstrap for:

- duplicate capability declarations;
- duplicate provider IDs;
- unknown provider/dependency/selection capability;
- capability-token scope disagreement for the same key;
- missing required capability provider;
- ambiguous provider selection;
- invalid explicit/default provider selection;
- ambient provider pretending to own Tenant/Principal/Operation scope;
- unbound dependency;
- dependency visibility violation;
- dependency cycle.

Errors remain semantic and machine-distinguishable.

## Dependency visibility

A provider may depend only on capabilities visible from its Context:

```text
deployment -> tenant -> principal -> operation
```

A child may consume an ancestor. A parent cannot consume a descendant. Principal siblings cannot depend on one another.

## Global identity vs canonical local identity

MR-A initially used the entire Plan fingerprint as the Tenant and Principal canonical definition identity. That was safe but too coarse: changing an unrelated Operation provider could falsely invalidate an otherwise identical Tenant.

The hardened model separates:

```text
CompositionPlan.fingerprint
  = exact whole-plan structural identity

CompositionPlan.scopeFingerprints[scope]
  = providers owned by that scope
    + selected ancestor providers in their dependency closure
```

Examples:

```text
Operation-only provider change
  -> global fingerprint changes
  -> Operation scope fingerprint changes
  -> Principal fingerprint stays stable
  -> Tenant fingerprint stays stable

Principal provider change
  -> Principal fingerprint changes
  -> Tenant fingerprint stays stable

Deployment provider used by Tenant changes
  -> Tenant fingerprint changes because it belongs to Tenant's dependency closure
```

Canonical Tenant/Principal Runtime definitions use their **scope fingerprint**, not the whole Plan fingerprint.

This preserves two guarantees simultaneously:

- true creation drift still fails with `RuntimeDefinitionConflictError`;
- unrelated descendant evolution does not create false parent conflicts.

v0.3 still does not define hot mutation of an active canonical node. Recreate the affected slice rather than ambiguously changing its creation recipe in place.

## Materialization transaction

```text
validated CompositionPlan
      ↓
isolate owned capability service names
      ↓
prepare selected providers in dependency order
      ↓
verify dependency visibility
      ↓
await setup
      ↓
verify the capability is materially visible
      ↓
optional synchronous commit
      ↓
publish canonical scope / activate Operation
```

Tenant/Principal use the existing unpublished Runtime transaction. Deployment and Operation each have explicit Cordis owner Fibers.

## Operation consumption

Operations consume typed tokens:

```ts
const operation = principal.operations.start({
  requires: [agents, credentials],
  execute({ capabilities }) {
    const dshAgents = capabilities.require(agents)
    const credential = capabilities.require(credentials)
  },
})
```

The token determines the return type. Operation still captures values exactly once before semantic execution.

## Boundary planes

Composition is only one plane in the Framework. Product identity ingress and Agent integration are separate semantic boundaries. See [`saas-boundaries.md`](./saas-boundaries.md).

In particular, the next stage must not assume Authenticated Identity, Credentials and MCP are three equivalent Provider slots:

- identity enters before canonical Runtime selection;
- credentials are a Principal-owned Runtime capability;
- MCP is expected to be exercised first as an Agent integration consuming multiple Runtime capabilities and DSH-native seams.

## Package boundary

No new `dsh-saas` package is justified by this hardening pass. Typed capability, Composition, Runtime and Operation still form one tightly related lifecycle contract inside `dsh-multi-tenant`.

Package topology remains revisitable only when a real independent consumer/lifecycle/release boundary appears.

## Executable evidence

- `packages/multi-tenant/tests/composition.test.ts` — typed normalization, validation, scope authority, dependency-closure fingerprints and canonical locality;
- `packages/multi-tenant/tests/operation.test.ts` — typed one-shot Operation snapshots and lifecycle;
- `scripts/saas-core-vertical-slice-probe.mjs` — typed multi-tenant Plan -> Operation -> real DSH AgentRegistry create/resume/failure;
- `scripts/package-smoke.mjs` — the packed npm artifact proves the same typed/locality contract.
