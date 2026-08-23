[简体中文](./ROADMAP.zh-CN.md) | English

# Roadmap

This project is in rapid prerelease development. We optimize for long-term architecture, data structures, lifecycle semantics and explicit contracts instead of preserving early shapes.

```text
v0.1  Security Kernel
  ↓
v0.2  Multi-Tenant Runtime Contract
  ↓
v0.3  SaaS Framework Core
  ↓
v0.4  Production Provider Ecosystem & Productization
```

## v0.1 — frozen Security Kernel

v0.1 owns the durable authorization invariant:

- minimal `{ tenantId, userId }` principal identity;
- claim-once immutable Session ownership;
- fail-closed authorization;
- replaceable `TenantSessionStore` contract.

This layer should remain small, stable and boring.

## v0.2 — published Multi-Tenant Runtime Contract

`dsh-multi-tenant@0.2.0-rc.3` is the published Runtime foundation that v0.3 composes rather than rewrites.

```text
Deployment / Root
  ├─ shared ownership kernel
  └─ TenantRuntimeService
       └─ Tenant                  canonical capability node
            └─ Principal         canonical capability node
```

The durable v0.2 contract includes canonical identity/lifecycle, unpublished setup, explicit publication, cancellable preparing transactions, Cordis capability isolation, quiescent teardown, DSH caller-bound `ownerCtx` evidence and executable provider isolation contracts.

Historical Web/ApiProxy/global-admission research remains in Git history instead of the live architecture.

---

# v0.3 — SaaS Framework Core

## Definition of Value

v0.3 moves the project from **a safe Multi-Tenant Runtime** to **an executable SaaS Framework Core**.

```text
SaaSDefinition
      ↓ compile / validate
immutable CompositionPlan
      ↓ materialize
canonical Tenant / Principal
      ↓
Principal-owned one-shot Operation
      ↓ capability snapshot
DSH Agent create / resume / drive
      ↓
deterministic teardown
```

v0.3 is not complete because many features exist. It is complete when this path is strongly typed, fail-fast, lifecycle-safe, replaceable and executable as a real multi-tenant DSH vertical slice.

The final framework must guarantee:

- invalid composition fails before user traffic;
- Tenant and Principal capability state remains isolated;
- canonical Runtime nodes cannot silently adopt structurally different compositions;
- one user-visible action maps to one semantic Operation;
- provider churn cannot silently duplicate Operation work;
- Principal teardown drains its Operations;
- DSH create/resume receives the correct caller-bound Tenant/Principal/Operation context;
- provider implementation can be replaced without rewriting the core;
- critical DSH/Cordis assumptions remain executable CI evidence.

## Architecture target

```text
                         SaaS Framework Core
                                │
                       Composition Compiler
                                │
                        CompositionPlan
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
           Tenant            Principal          Operation
             │                  │                  │
             └──────── Capability Contracts ──────┘
                                │
                     Replaceable Providers
                                │
                       dsh-multi-tenant
                                │
                         Cordis + DSH
```

Auth, Credentials, MCP, Transport, Audit and Usage are capability responsibilities, **not pre-approved package names**.

## Engineering laws

```text
Spec
  → Assumption Ledger
  → executable probe / contract test
  → strong types + state model
  → failing behavior test
  → smallest implementation
  → vertical-slice CI proof
```

Additional rules:

- `SaaSDefinition` is intent; Runtime does not repeatedly interpret it.
- `CompositionPlan` is normalized, deterministic and immutable.
- scope names must correspond to real lifecycle/authority boundaries.
- Cordis remains the DI/service/lifecycle substrate.
- Operation is Principal-owned and one-shot in semantic effect.
- public API may not depend on an open blocking assumption.
- provider compatibility is an executable contract.
- package topology follows proven architecture.
- prerelease compatibility is disposable when it obstructs the better model.

---

# Milestone status

## M0 — P0 Spec / Assumption Foundation — ✅ complete

Delivered:

- bilingual live specs for SaaS Composition and Operation lifecycle;
- machine-readable Assumption Ledger;
- DSH/Cordis executable probes;
- Node 22.19 / Node 24 platform-assumption lanes;
- promotion rule: blocking open assumptions cannot support public API.

## M1 — Composition Compiler — ✅ complete

Delivered:

```text
SaaSDefinition
      ↓
compileSaaSDefinition()
      ↓
immutable CompositionPlan
```

The compiler now provides:

- stable capability key;
- `deployment | tenant | principal | operation` ownership vocabulary;
- required/optional capability;
- deterministic provider selection;
- provider dependency graph;
- deterministic topological bootstrap order;
- immutable normalized Plan;
- deterministic structural fingerprint.

It fails before bootstrap for duplicate/unknown/missing/ambiguous provider states, scope mismatch, false-scoped ambient providers, dependency visibility violations and dependency cycles.

### Scope is authority, not metadata

Ambient external providers are deployment-only. Tenant/Principal/Operation providers must actually materialize inside their declared Cordis scope.

### Canonical Plan drift

Plan fingerprint participates in Runtime definition identity:

```text
saas:tenant:<plan fingerprint>
saas:principal:<plan fingerprint>
```

Equivalent Plans can join the same canonical Runtime node. Structurally different Plans fail with `RuntimeDefinitionConflictError` instead of silently sharing it.

v0.3 deliberately does not define hot mutation from one Plan to another.

## M2 — Principal Operation Kernel + A6 — ✅ complete

The final A6 design is **not** reactive `ctx.inject()` business work.

```text
Principal
  └─ non-reactive Operation Fiber
       ├─ operation-local provider setup
       ├─ one-shot capability snapshot
       ├─ execute exactly once
       └─ quiescent teardown
```

Delivered:

- Principal-owned Operation registry;
- explicit semantic lifecycle states;
- one-shot required capability snapshot;
- no re-entry on provider churn;
- explicit cancellation signal;
- Principal teardown closes admission and drains Operations;
- idempotent/quiescent cancel and dispose;
- causal downstream errors;
- semantic Operation error taxonomy.

`A6` is now **proven**. Cordis reactive injection remains useful for plugin lifecycle but is not the semantic transaction primitive.

## M3 — Multi-tenant DSH Core Vertical Slice — ✅ complete

The real pinned public `@deepseek-ai/dsh-agent` AgentRegistry is exercised from the new Operation boundary.

The executable proof covers concurrent:

```text
Acme / Alice  -> create
Acme / Bob    -> create
Globex / Alice -> create
Acme / Alice  -> resume
Acme / Alice  -> create failure
```

It proves:

- correct Tenant/Principal identity at DSH factory `ownerCtx`;
- correct Tenant, Principal and Operation-local capability visibility;
- one semantic execution per Operation;
- Agent setup before returned handle use;
- create/resume caller binding;
- downstream create failure preserves causal error;
- failed Operation leaves no live registry entry;
- Tenant teardown does not affect another Tenant;
- successful handles are drained.

The same contract is exercised from the **packed npm tarball** in a clean consumer, not only from workspace source.

### M3 package-boundary gate — decision: keep one package

We do **not** create `dsh-saas` after M3.

Composition + Operation currently extend the same Runtime ownership/lifecycle contract and have not demonstrated enough independent versioning/distribution value to justify a second workspace package.

They remain public subpaths of `dsh-multi-tenant`:

```text
dsh-multi-tenant/runtime
dsh-multi-tenant/operation
dsh-multi-tenant/composition
dsh-multi-tenant/testing
```

This decision is intentionally revisitable after M4/M5, when real SaaS capability contracts provide stronger evidence.

---

# Current main line: M4 + M5

MR-B should prove the **capability ecosystem**, not maximize provider count.

## M4 — Minimal SaaS capability contracts

Priority contracts:

### 1. Authenticated Identity Boundary

```text
trusted external authenticated subject
        ↓
TenantPrincipal
        ↓
canonical Tenant / Principal
```

The framework should not own JWT/OAuth/SAML parsing. It owns the semantic boundary after authentication has established trusted identity.

### 2. Credentials Capability

A Principal-owned credential capability must preserve:

- Tenant isolation;
- Principal sibling isolation;
- lifecycle ownership;
- explicit consumer boundary;
- replaceability without Framework Core edits.

### 3. MCP Capability

MCP is the strongest reference capability because it naturally exercises:

```text
Tenant configuration
      +
Principal credential
      +
Operation consumption
      +
DSH Agent composition
```

The contract should use DSH/MCP native seams where they are stable instead of building a parallel protocol stack.

**M4 exit gate:** these contracts are minimal, replaceable and explainable without vendor-specific assumptions leaking into the Framework Core.

## M5 — Minimal reference providers

Provide only enough real/default implementations to prove the contracts are genuinely usable.

Likely scope:

- simple/callback authenticated identity adapter;
- in-memory/reference credential provider;
- one real MCP integration path;
- existing reference durable ownership store where relevant.

Do **not** turn M5 into Auth0/Okta/Vault/Redis/Postgres/vendor breadth.

**M5 exit gate:** replacing a reference provider with another conforming implementation requires no Framework Core change, and one realistic Auth -> Principal -> Credentials -> MCP -> Operation -> DSH Agent path works end to end.

At the end of M5 we reevaluate whether a separate SaaS/package boundary has actually emerged.

---

## M6 — Diagnostics and explainability

A Composition Framework must explain itself.

The framework should be able to answer:

- which provider was selected and why;
- which scope owns it;
- what it depends on;
- why a definition/provider was rejected;
- where bootstrap failed;
- what the normalized Plan/fingerprint is;
- which canonical Runtime definition is active.

The exact API may evolve, but semantic diagnostics are part of v0.3 because unclear diagnostics usually indicate an unclear model.

## M7 — Conformance and compatibility hardening

Expand executable evidence across:

- Composition validation and determinism;
- Plan/canonical drift;
- Tenant/Principal isolation;
- Operation prepare/active/cancel/failure/teardown/provider churn;
- DSH create/resume/setup/publication/failure;
- provider replacement/failure;
- Node 22.19 and Node 24;
- pinned DSH/Cordis assumptions;
- packed consumer behavior.

GitHub Actions remains upstream truth detector, architecture gate and regression firewall.

## M8 — v0.3 release convergence

No new architecture should be invented here.

Release convergence means:

- remove research/intermediate surfaces that did not become architecture;
- freeze only earned public/package boundaries;
- align README/spec/reference docs with actual code;
- publish a clear compatibility/security boundary;
- run packed and registry consumer smoke;
- keep install/distribution mechanics minimal unless the contract truly needs more.

---

# v0.3 Golden Test

The final release acceptance must resemble a real SaaS composition:

```text
Tenant Acme
├─ Alice
│  ├─ Credentials A
│  └─ MCP A
└─ Bob
   ├─ Credentials B
   └─ MCP A

Tenant Globex
└─ Alice
   ├─ Credentials C
   └─ MCP B
```

Concurrent Operations must prove each DSH Agent sees only the correct Tenant capability, Principal credential and MCP composition. Dispose/failure/recreation must preserve sibling and cross-Tenant isolation.

The same suite must feed invalid Definition states and prove they fail before user traffic.

# v0.3 Definition of Done

v0.3 is complete only when all are true:

1. `SaaSDefinition -> CompositionPlan` is deterministic, strongly typed and fail-fast. ✅
2. one user-visible action has one semantic Operation boundary; A6 is proven. ✅
3. Principal -> Operation -> real DSH create/resume/failure is executable CI evidence. ✅
4. Tenant/Principal capability isolation survives concurrency, failure, teardown and recreation.
5. minimal Authenticated Identity / Credentials / MCP contracts prove replacement without vendor products entering Core.
6. at least one reference composition is genuinely usable end to end.
7. semantic diagnostics explain Plan selection and failures.
8. platform assumptions/provider contracts are executable on supported baselines.
9. package boundaries reflect proven independent value rather than speculative names. ✅ for M3: one package retained.
10. current docs/install instructions describe the artifact users actually receive.

Items 4–10 are completed progressively by M4–M8; checked items already have MR-A evidence.

# Explicit v0.3 non-goals

Not required for v0.3:

- broad OAuth/OIDC/SAML vendor integrations;
- production Vault/Redis/Postgres credential ecosystems;
- complete MCP Apps/Resources product UX;
- billing/audit/usage products;
- Web admin UI;
- Marketplace/discoverability work;
- Distribution/Profile polish beyond released contract needs;
- one-tenant-per-Pod orchestration;
- arbitrary dynamic provider hot reconfiguration;
- a large migration/provider ecosystem.

These concerns must not delay the Framework Core.

---

# v0.4 preview — Production Provider Ecosystem & Productization

v0.4 turns stable v0.3 contracts into a broader production-ready SaaS ecosystem.

Expected direction includes:

- production authentication/identity integrations;
- durable credential/secret providers;
- richer MCP/MCP Apps/Resources integrations where DSH exposes stable seams;
- audit, usage, observability and operational providers;
- durable stores/migrations/compatibility tooling;
- stronger process/container/Pod deployment profiles;
- improved out-of-box Distribution/install experience;
- ecosystem provider documentation/conformance certification.

This is intentionally a **preview, not a detailed v0.4 roadmap**. Exact scope will come from v0.3 architecture and real usage evidence.

---

# Engineering rules across versions

- design globally before editing locally;
- specification/tests precede public abstraction;
- verify external assumptions with executable evidence;
- prefer structures that make invalid states unrepresentable;
- model lifecycle/publication explicitly;
- use semantic TypeScript types instead of loose fields;
- optimize for relevance as well as technical correctness;
- do not preserve prerelease compatibility when it degrades the long-term model;
- remove obsolete experiments from the live tree when Git history is enough;
- use Cordis/DSH native abstractions rather than parallel registries/forks;
- create package boundaries only after independent value is proven;
- where we control a boundary, enforce it; where ecosystem cooperation is required, standardize it; where neither can enforce, document the boundary.

# Explicit security boundary

Cordis Context is a trusted same-process composition/lifecycle boundary, not a hostile-code sandbox. It does not isolate process memory, filesystem, shell, network, environment variables or malicious same-process plugins. Strong isolation belongs to process/container/Pod deployment boundaries.
