[简体中文](./ROADMAP.zh-CN.md) | English

# Roadmap

This project is in rapid prerelease development. We optimize for long-term architecture, data structures, lifecycle semantics and explicit contracts instead of preserving early shapes.

The version line is intentionally cumulative:

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
- claim-once immutable session ownership;
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
                 └─ derived integration fibers
                      └─ DSH Agent / product operations
```

The durable v0.2 contract includes:

- canonical Tenant / Principal identity and lifecycle;
- structurally nested Principal ownership;
- unpublished setup and explicit publication boundaries;
- cancellable preparing transactions and quiescent teardown;
- Cordis-backed capability isolation;
- separate DSH Agent/Preset scope semantics;
- caller-bound DSH `ownerCtx` composition;
- executable provider isolation contracts;
- explicit DSH compatibility baselines and probes.

Historical Web/ApiProxy and global admission-decorator research remains in Git history rather than the live architecture.

---

# v0.3 — SaaS Framework Core

## What v0.3 means

v0.3 is the transition from **a safe Multi-Tenant Runtime** to **an executable SaaS Framework Core**.

The release is not considered complete because several providers exist. It is complete when the framework can take trusted SaaS intent, compile it into a validated capability graph, bind work to one canonical Principal, drive DSH Agent create/resume through a one-shot Operation boundary, and tear everything down deterministically.

The v0.3 north-star path is:

```text
SaaSDefinition
      ↓ normalize + validate
CompositionPlan
      ↓ bootstrap
canonical Tenant / Principal
      ↓
one semantic Operation
      ↓
capability acquisition
      ↓
DSH Agent create / resume / drive
      ↓
deterministic teardown
```

### v0.3 final user/developer effect

By the end of v0.3, a framework consumer should be able to describe a SaaS capability composition and rely on the framework to guarantee that:

- invalid composition fails before user traffic;
- Tenant A and Tenant B do not share tenant-local capability state;
- Principal siblings do not share principal-local capability state;
- one user-visible action maps to one semantic Operation;
- dependency churn cannot silently duplicate externally visible Operation work;
- Principal teardown drains its active/preparing Operations;
- DSH Agent create/resume uses the correct Principal-derived `ownerCtx`;
- provider implementations can be replaced without rewriting the Framework Core;
- external DSH/Cordis assumptions are executable CI evidence rather than undocumented beliefs.

This is the v0.3 Definition of Value.

## v0.3 architecture target

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

Capability names such as Auth, Credentials, MCP, Transport, Audit and Usage describe responsibilities. They are **not pre-approved package names**. A package appears only when an independent API, replacement boundary, lifecycle boundary, release boundary or Distribution boundary is demonstrated.

## v0.3 engineering laws

All milestones inherit the P0 development sequence:

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

- `SaaSDefinition` is user/distribution intent; Runtime code does not repeatedly reinterpret it.
- `CompositionPlan` is normalized, deterministic and free of unresolved ambiguity.
- Cordis remains the DI/service/lifecycle substrate; v0.3 must not build another `ServiceRegistry` or `ProviderContainer`.
- Operation is Principal-owned, ephemeral and one-shot in semantic effect.
- a blocking external assumption cannot support public API while its Assumption Ledger status is `open`.
- provider compatibility is a contract, not an inference from `ctx.provide()` working once.
- package topology follows proven architecture rather than predicting it.

---

## v0.3 milestone roadmap

### M0 — P0 Foundation — complete

The engineering foundation is already merged.

Delivered:

- bilingual P0 specs for Composition and Operation lifecycle;
- machine-readable Assumption Ledger;
- DSH/Cordis executable platform probes;
- CI platform-assumption lanes on Node 22.19 and Node 24;
- promotion gates preventing public API from depending on unresolved blocking assumptions.

Current critical open gate:

- **A6** — the final one-shot Operation dependency-acquisition model must prove that provider churn cannot duplicate externally visible work.

### M1 — Composition Compiler

Implement the smallest `SaaSDefinition -> CompositionPlan` model before real provider products shape the abstraction.

P0 vocabulary should initially cover only what the vertical slice needs:

- stable capability key;
- semantic ownership scope: `deployment | tenant | principal | operation`;
- required vs optional capability;
- provider binding;
- provider dependency edges;
- single/multiple cardinality only when backed by a real use case;
- deterministic default selection and bootstrap order.

The compiler must reject, with machine-distinguishable semantic errors:

- missing required capability;
- duplicate provider for an exclusive slot;
- scope incompatibility;
- dependency visibility violations;
- dependency cycles;
- conflicting canonical definitions.

**Exit gate:** valid input always produces a deterministic immutable plan; invalid input fails before Runtime bootstrap.

### M2 — Operation Kernel and A6 resolution

Define the one-shot Principal Operation lifecycle without confusing Cordis reactive injection with one user transaction.

The Operation model must cover:

- structural ownership by exactly one Principal;
- explicit lifecycle states for prepare/active/cancel/fail/dispose;
- one-shot dependency acquisition or an equivalent proven re-entry-safe design;
- cancellation and parent-disposal propagation;
- exactly-once cleanup of Operation-local resources;
- idempotent, quiescent cancellation/disposal;
- causal error preservation;
- safe Agent create/resume boundary.

**Hard exit gate:** A6 changes from `open` to `proven`. No public Operation API before this happens.

### M3 — End-to-end fake-provider vertical slice

Connect M1 and M2 before introducing production provider integrations.

Using fake/test capabilities, prove:

```text
SaaSDefinition
  → CompositionPlan
  → Tenant
  → Principal
  → Operation
  → capability acquisition
  → DSH Agent create/resume
  → Agent publication
  → teardown
```

The vertical slice must exercise multiple tenants and principals concurrently and prove isolation, publication safety and teardown.

**Package boundary gate:** only after this milestone do we decide whether Composition + Operation has become an independently valuable public package boundary such as a future `dsh-saas`. The roadmap does not pre-approve that result.

### M4 — Minimal SaaS capability contracts

Only after the framework core works with fake capabilities do concrete product concerns begin shaping stable contracts.

v0.3 should focus on the smallest contracts required to prove the SaaS model, with priority on:

- **Authenticated Identity Boundary** — trusted external subject -> canonical `TenantPrincipal`;
- **Credentials Capability** — Principal-owned credentials that preserve sibling/tenant isolation;
- **MCP Capability** — Tenant/Principal-aware MCP composition consumed safely by an Operation/Agent.

The objective is contract quality and replacement semantics, not vendor breadth.

### M5 — Minimal reference providers

Provide only enough real/default implementations to prove that the framework is usable and provider replacement is real.

Likely examples include:

- a simple/static or callback-based identity adapter;
- an in-memory/reference credential provider;
- one real MCP path sufficient to exercise Tenant config + Principal credentials + Operation consumption;
- existing in-memory/reference durable store capabilities where useful.

**Exit gate:** replacing a reference provider with another conforming implementation does not require Framework Core changes.

### M6 — Diagnostics and explainability

A composition framework must be diagnosable before it becomes pleasant to use.

v0.3 should expose framework-level validation/explanation sufficient to answer:

- which provider was selected for a capability and why;
- which Runtime scope owns it;
- what it depends on;
- why a provider or definition was rejected;
- where bootstrap failed;
- what the normalized `CompositionPlan` contains.

The exact public API may evolve, but semantic diagnostics belong in v0.3 because they validate the clarity of the underlying model.

### M7 — Conformance and compatibility hardening

Expand executable evidence from the Runtime kernel to the SaaS Framework Core.

Required coverage includes:

- Composition: missing, duplicate, scope mismatch, visibility violation, cycle, deterministic normalization;
- Isolation: Tenant A/B, Principal siblings, teardown, clean recreation;
- Operation: preparing, active, cancellation, failure, parent teardown, provider churn, idempotent cleanup;
- DSH: create, resume, ownerCtx, setup/publication failure;
- Provider replacement and failure behavior;
- Node 22.19 and Node 24 platform lanes;
- exact DSH/Cordis assumption evidence.

GitHub Actions remains an upstream truth detector, architecture gate and regression firewall.

### M8 — v0.3 release convergence

Freeze the v0.3 public contract only after the Golden Path and conformance gates are green.

Release convergence includes:

- remove research surfaces that did not become architecture;
- freeze only package boundaries demonstrated by the implementation;
- align README/spec/reference docs with the actual public contract;
- run packed/registry consumer smoke against the artifacts users install;
- publish a clear compatibility matrix and explicit security boundary;
- keep installation/distribution mechanics minimal unless they are necessary for the released contract.

---

## v0.3 Golden Test

The final acceptance test should model a realistic multi-tenant composition rather than a toy single-scope example.

Conceptually:

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

Concurrent Operations must prove that every Agent observes the correct Tenant capability, Principal credential and MCP composition; create/resume uses the correct session and owner context; disposing one Principal drains only its Operations; sibling and other-tenant work remains unaffected.

The same acceptance suite must feed invalid definitions such as missing capability, duplicate exclusive provider, dependency cycle and scope mismatch and prove they fail while constructing the `CompositionPlan`, before user traffic.

## v0.3 Definition of Done

v0.3 is complete when all of the following are true:

1. `SaaSDefinition -> CompositionPlan` is deterministic, strongly typed and fail-fast.
2. the Operation model gives one user-visible action one semantic execution boundary and A6 is proven.
3. the Principal -> Operation -> DSH create/resume path is an executable CI vertical slice.
4. Tenant and Principal capability isolation survives concurrency, failure, teardown and recreation.
5. minimal Authenticated Identity, Credentials and MCP capability contracts prove the replacement model without pulling vendor products into the core.
6. at least one reference composition is genuinely usable end-to-end.
7. semantic diagnostics make the selected plan and failure causes understandable.
8. platform assumptions and provider contracts are executable on supported Node/DSH/Cordis baselines.
9. package boundaries reflect proven independent value rather than speculative capability names.
10. current docs and install instructions describe the artifact users actually receive.

## Explicit v0.3 non-goals

These are intentionally not required to declare v0.3 successful:

- broad OAuth/OIDC/SAML vendor integrations;
- production Vault/Redis/Postgres credential ecosystems;
- complete MCP Apps/Resources product UX;
- billing, audit or usage products;
- Web administration UI;
- plugin marketplace/discoverability work;
- polished Distribution/Profile packaging beyond what the contract needs;
- one-tenant-per-Pod orchestration;
- arbitrary dynamic provider hot-reconfiguration;
- a large migration/provider ecosystem.

Those concerns must not delay the SaaS Framework Core.

---

# v0.4 preview — Production Provider Ecosystem & Productization

v0.4 is the stage where the v0.3 Framework Core becomes a broader production-ready SaaS ecosystem.

The intended effect is that teams can adopt the stable composition/Operation contracts from v0.3 and choose production-grade integrations instead of building every surrounding capability themselves.

Expected direction includes areas such as:

- production authentication/identity integrations;
- durable credential and secret providers;
- richer MCP/MCP Apps/Resources integrations where DSH exposes stable seams;
- audit, usage, observability and operational providers;
- durable stores, migrations and compatibility tooling;
- deployment profiles, including stronger process/container/Pod isolation options;
- improved out-of-box Distribution and installation experience;
- ecosystem/provider documentation and conformance certification.

This is intentionally a **preview, not a detailed v0.4 roadmap**. The exact v0.4 scope will be planned from the architecture and real usage evidence produced by v0.3 rather than being precommitted today.

---

## Engineering rules across version lines

- design globally before editing locally;
- specification and tests precede public abstraction;
- verify external assumptions with executable evidence;
- prefer structures that make invalid states unrepresentable;
- model lifecycle and publication state explicitly;
- use strong semantic TypeScript types instead of loose field conventions;
- optimize for relevance as well as technical correctness;
- do not preserve prerelease compatibility when it degrades the long-term model;
- do not preserve obsolete experiments in the live tree when Git history is sufficient;
- use Cordis/DSH native abstractions rather than parallel registries or local forks;
- create package boundaries only after their independent value is demonstrated;
- where this repository controls a boundary, enforce it; where the ecosystem controls it, standardize it; where neither can enforce it, document the boundary.

## Explicit security boundary

Cordis Context is a trusted same-process composition/lifecycle boundary, not a hostile-code sandbox. It does not isolate process memory, filesystem, shell, network, environment variables or malicious plugins. Strong isolation belongs to process/container/Pod deployment boundaries.
