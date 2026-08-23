[简体中文](./saas-composition.zh-CN.md) | English

# Spec — SaaS Composition Model

> Status: **implemented for v0.3 M1/M3**. The current model is protected by deterministic compiler tests, canonical Runtime drift tests, packed-consumer smoke and the pinned-DSH vertical proof.

## Purpose

v0.2 owns canonical Tenant/Principal lifecycle. v0.3 adds only the SaaS semantics needed to answer:

- which capabilities constitute this composition;
- which provider is selected for each capability;
- which Runtime scope owns it;
- which capabilities it depends on;
- whether the complete graph is valid before traffic;
- whether a canonical Runtime node is already running a different composition.

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

### SaaSDefinition

The definition is unordered consumer/distribution intent. It may declare required/optional capabilities, provider candidates, explicit/default selection and dependency edges.

Runtime code never repeatedly interprets this mutable shape.

### CompositionPlan

The compiler resolves all ambiguity before Runtime bootstrap. A Plan contains:

- normalized capability bindings;
- selected provider definitions;
- deterministic topological bootstrap order;
- a deterministic structural `fingerprint`.

The fingerprint excludes JavaScript callback object identity. Provider authors therefore use stable provider IDs plus optional `definitionKey` when configuration changes the semantic creation recipe. Two semantically different recipes must not reuse the same identity.

### Runtime Composition

The Plan materializes directly onto the existing ownership graph:

```text
Deployment
   ↓
Tenant
   ↓
Principal
   ↓
Operation
```

No parallel `ProviderContainer`, `ServiceRegistry` or local dependency resolver exists.

## Scope means real authority

The four scope names are lifecycle/authority semantics, not labels:

- `deployment` — application/process-wide capability;
- `tenant` — owned by one canonical Tenant;
- `principal` — owned by one canonical Principal;
- `operation` — owned by one ephemeral Principal Operation.

A non-deployment provider must actually materialize inside its declared scope. Therefore:

- a deployment provider may be **ambient** (`setup` absent) when an external DSH/Cordis capability already exists;
- a deployment provider may also be managed by the Plan;
- Tenant/Principal/Operation providers require a scoped `setup` materializer.

This prevents a declaration such as “principal-scoped credentials” from secretly resolving an inherited root service.

## P0 provider shape

The P0 contract intentionally stays small:

```ts
interface CapabilityDefinition {
  key: string
  scope: CapabilityScope
  required?: boolean
  defaultProvider?: string
}

interface ProviderBase {
  id: string
  capability: string
  requires?: readonly string[]
  definitionKey?: string
}
```

Provider setup receives only the real Cordis Context, semantic scope and cancellation signal. It may optionally return a synchronous publication commit.

No priorities, policy DSL, arbitrary hook graph or dynamic selection language is introduced without a real vertical-slice need.

## Compile-time invariants

`compileSaaSDefinition()` fails before Runtime bootstrap for:

- duplicate capability declarations;
- duplicate provider IDs;
- unknown provider target capability;
- missing required capability provider;
- ambiguous provider selection;
- invalid explicit/default provider selection;
- provider/capability scope mismatch;
- ambient provider pretending to own Tenant/Principal/Operation scope;
- unknown or unbound provider dependency;
- dependency visibility violation;
- dependency cycle.

Errors are semantic and machine-distinguishable.

## Dependency visibility

```text
deployment -> tenant -> principal -> operation
```

A child scope may depend on a visible ancestor capability. A parent cannot depend on a descendant capability, and Principal siblings cannot depend on each other.

The compiler rejects impossible graph shapes rather than waiting for `ctx.get()` to fail in production.

## Determinism and canonical drift

Equivalent unordered definitions compile to the same normalized plan, bootstrap order and fingerprint.

When a Plan creates canonical Tenant/Principal nodes, the generated Runtime definition carries:

```text
saas:<scope>:<plan fingerprint>
```

This extends the v0.2 canonical definition contract:

- a consumer calling `ensure(identity)` can still join without knowing the recipe;
- an equivalent Plan can explicitly join the existing node;
- a structurally different Plan cannot silently reuse an active canonical Tenant/Principal merely because it isolates the same service names.

Such drift fails with `RuntimeDefinitionConflictError`.

v0.3 does not define hot adoption of a different Plan. Reconfiguration semantics remain out of scope; recreate the relevant canonical graph instead of mutating it ambiguously.

## Materialization transaction

For managed scopes:

```text
validated CompositionPlan
      ↓
isolate capability service names
      ↓
prepare providers in deterministic dependency order
      ↓
verify required dependencies
      ↓
await provider setup
      ↓
verify provided capability is actually visible
      ↓
optional synchronous commits
      ↓
publish canonical scope / activate Operation
```

Tenant/Principal setup uses the existing unpublished Runtime transaction, so provider failure cannot expose a partially prepared canonical node.

Deployment composition is owned by one explicit Cordis child Fiber. Operation composition is owned by the one-shot Operation Fiber.

## Provider compatibility remains executable

Calling `ctx.provide()` is not enough to claim SaaS compatibility. Repository evidence continues to protect:

- Tenant A/B isolation;
- Principal sibling isolation;
- ancestor inheritance;
- parent/root non-leakage;
- teardown isolation;
- clean recreation;
- unpublished setup ownership;
- Operation one-shot semantics.

Concrete Auth/Credentials/MCP contracts in M4/M5 will build on this model rather than change its dependency/lifecycle substrate.

## Package-boundary gate

M3 does **not** create a `dsh-saas` package.

Composition + Operation currently extend the same Runtime ownership contract and do not yet demonstrate enough independent versioning/distribution value to justify a new workspace package. They remain exported subpaths of `dsh-multi-tenant`.

The decision is intentionally deferred to M4/M5. If real capability contracts create an independent consumer API, replacement/lifecycle boundary or distribution boundary, a package may then emerge from evidence rather than roadmap prediction.

## Executable evidence

- `packages/multi-tenant/tests/composition.test.ts` — normalization, validation, scope truth, fingerprint and canonical drift;
- `packages/multi-tenant/tests/operation.test.ts` — one-shot Operation lifecycle;
- `scripts/saas-core-vertical-slice-probe.mjs` — multi-tenant Plan -> Operation -> real DSH AgentRegistry create/resume/failure;
- `scripts/package-smoke.mjs` — the packed npm artifact exposes and executes the same Composition/Operation contract.
