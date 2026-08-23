[简体中文](./saas-composition.zh-CN.md) | English

# Spec — SaaS Composition Model

> Status: P0 design contract. No public implementation is frozen by this document yet.

## Problem

v0.2 provides canonical Tenant/Principal runtime nodes and scoped capability ownership. v0.3 needs a thin SaaS semantic layer that answers which capabilities are required, who provides them, at which Runtime scope they belong, and whether the graph is valid before traffic starts.

It must **not** become another DI container.

## Three representations

The model separates user intent, validated structure and live runtime state:

```text
SaaSDefinition
  human/distribution intent
        ↓ normalize + validate
CompositionPlan
  immutable executable structure
        ↓ bootstrap
Runtime Composition
  Cordis-backed live capability graph
```

### `SaaSDefinition`

Mutable/config-oriented input. It may contain defaults, optional selections and unordered provider declarations. It is not trusted by runtime execution.

### `CompositionPlan`

Normalized and immutable. Every required capability is bound, scope placement is valid, dependencies are acyclic, provider multiplicity is resolved and bootstrap order is deterministic.

No runtime code should repeatedly reinterpret raw `SaaSDefinition`.

### Runtime Composition

The plan is applied onto existing Runtime structure:

```text
Deployment / Root
  ↓
Tenant
  ↓
Principal
  ↓
Operation
```

Capabilities are implemented using native Cordis service/context/fiber semantics. The composition layer does not own a parallel service registry.

## P0 scope vocabulary

P0 recognizes four semantic ownership levels:

- `deployment` — one application/runtime process;
- `tenant` — owned by one canonical Tenant;
- `principal` — owned by one canonical Principal under a Tenant;
- `operation` — ephemeral work derived from one Principal.

This vocabulary describes lifecycle/ownership. It does not imply four physical package types.

## Slot semantics

A capability slot describes a requirement in the composition graph, not an implementation registry.

P0 must be able to express at least:

- stable semantic capability key;
- ownership scope;
- required vs optional;
- single vs multiple provider cardinality only where a real use case needs it;
- provider dependencies on other capability keys;
- deterministic provider selection when a default exists.

Do not add generic policy languages, priorities, conditions or arbitrary hook graphs until a concrete vertical slice requires them.

## Validation invariants

`SaaSDefinition -> CompositionPlan` fails before bootstrap when any of these states exist:

1. required capability has no provider;
2. an exclusive slot has multiple providers;
3. provider is placed at an incompatible scope;
4. dependency graph contains a cycle;
5. provider depends on a capability that cannot be visible from its ownership scope;
6. two declarations normalize to conflicting definitions for one canonical composition identity.

Errors must be semantic and machine-distinguishable. Final names are not frozen, but the error taxonomy should correspond to conditions such as missing capability, duplicate provider, scope mismatch and dependency cycle.

## Dependency visibility rule

A provider may depend only on capabilities visible from the Context in which it is mounted. P0 should prefer structure over runtime checks: invalid upward/sibling dependency shapes should be rejected while building the plan.

Conceptually:

```text
deployment -> tenant -> principal -> operation
```

A child may consume visible ancestor capability. A parent must not implicitly reach into one child. Principal siblings must not see each other's capability state.

## Bootstrap transaction

Plan application follows the existing publication vocabulary rather than inventing a new lifecycle:

```text
validated CompositionPlan
        ↓
prepare providers on unpublished Runtime scopes
        ↓
await provider setup
        ↓
commit where external publication requires a final synchronous boundary
        ↓
publish Runtime node
```

Provider bootstrap failure must leave no partially published canonical Tenant/Principal graph.

## Provider contract boundary

A provider is not considered compatible merely because it can call `ctx.provide()`.

Repository-owned conformance must continue proving:

- Tenant A/B isolation;
- Principal sibling isolation;
- correct ancestor inheritance;
- root/parent non-leakage;
- teardown isolation;
- clean recreation;
- unpublished setup compatibility.

The existing `dsh-multi-tenant/testing` contract is the starting evidence, not a reason to create a new provider framework.

## Non-goals for P0

P0 does not define:

- concrete OAuth/JWT providers;
- credential vault products;
- MCP vendor/server schemas;
- HTTP/WebSocket transport;
- audit/usage storage;
- Marketplace or Distribution bundles;
- dynamic runtime reconfiguration semantics;
- a generic plugin marketplace protocol.

## First implementation proof

The first implementation should use fake/test capabilities and prove this path:

```text
SaaSDefinition
  -> CompositionPlan
  -> Tenant
  -> Principal
  -> Operation
  -> explicit capability acquisition
  -> DSH Agent creation
```

Only after this vertical slice is green should concrete Auth/Credentials/MCP implementations start shaping public provider contracts.
