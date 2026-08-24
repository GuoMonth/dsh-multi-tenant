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

## Updated Definition of Value

MR-A changed how we understand the Framework boundary. v0.3 is not merely:

```text
SaaSDefinition -> Providers -> Agent
```

The more accurate north star is:

```text
Product / Transport
      ↓ product-owned authentication
Trusted Subject
      ↓ identity resolution
Product Ingress Boundary
      ↓
TenantPrincipal
      ↓
canonical Tenant / Principal
      ↓
Typed Runtime Capabilities
      ↓
Principal-owned one-shot Operation
      ↓ immutable capability snapshot
Agent Integration
      ↓ DSH-native Agent setup / plugin composition
DeepSeek Harness
```

This separates concerns that were previously described too flatly:

- **Product Ingress** selects trusted Runtime identity;
- **Runtime Capabilities** live under explicit Deployment/Tenant/Principal/Operation ownership;
- **Operation** is one semantic execution boundary;
- **Agent Integration** translates trusted Runtime state into native DSH Agent/Preset/plugin composition.

See [`docs/specs/saas-boundaries.md`](./docs/specs/saas-boundaries.md).

v0.3 is complete when this path is strongly typed, fail-fast, lifecycle-safe, replaceable and executable as a realistic multi-tenant DSH vertical slice.

## Architecture target

```text
Product / Transport
        │
        ▼
Trusted Identity Resolution
        │
        ▼
Tenant / Principal Runtime
        │
        ▼
Typed Capability Composition
        │
        ▼
One-shot Operation
        │
        ▼
Agent Integration
        │
        ▼
Cordis / DeepSeek Harness
```

Auth, Credentials, MCP, Transport, Audit and Usage remain responsibility names, **not pre-approved package names**.

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

- `SaaSDefinition` is mutable intent; Runtime does not repeatedly reinterpret it.
- `CompositionPlan` is normalized, deterministic and immutable.
- scope names represent real lifecycle/authority boundaries.
- capability key, value type and scope belong to one semantic token.
- Cordis remains the DI/service/lifecycle substrate.
- Operation is Principal-owned and one-shot in semantic effect.
- Product Ingress and Agent Integration are explicit boundaries, not hidden Provider conventions.
- public API may not depend on an open blocking assumption.
- provider/integration compatibility is executable evidence.
- package topology follows proven architecture.
- prerelease compatibility is disposable when it obstructs the better model.

---

# Milestone status

## M0 — Spec / Assumption Foundation — ✅ complete

Delivered bilingual live specs, machine-readable assumptions, DSH/Cordis probes, Node 22.19/24 platform lanes and promotion gates.

## M1 — Composition Compiler — ✅ complete

MR-A delivered:

- required/optional capabilities;
- provider selection;
- dependency graph and visibility rules;
- deterministic topological bootstrap order;
- immutable normalized Plan;
- semantic error taxonomy;
- real scope authority rather than metadata;
- full-plan structural fingerprint.

## M2 — Principal Operation Kernel + A6 — ✅ complete

MR-A proved the final Operation primitive is not reactive `ctx.inject()` business work.

```text
Principal
  └─ non-reactive Operation Fiber
       ├─ Operation-local setup
       ├─ one-shot capability snapshot
       ├─ execute exactly once
       └─ quiescent teardown
```

`A6` is proven on Node 22.19 and Node 24.

## M3 — Multi-tenant real-DSH Core Vertical Slice — ✅ complete

The pinned public `@deepseek-ai/dsh-agent` AgentRegistry is exercised from the Operation boundary for concurrent create, resume and failure paths across multiple Tenant/Principal identities.

Packed npm consumer smoke executes the same contract.

### M3 package-boundary gate — keep one package

No `dsh-saas` package yet. Runtime, typed composition and Operation still form one coherent lifecycle contract.

---

## M3.5 — Post-MR-A Architecture Hardening — current

MR-A intentionally optimized for a complete vertical slice. The slice exposed two structural debts that are cheaper to remove before product-facing capabilities arrive.

### 1. Typed Capability Tokens

The old shape allowed:

```ts
capabilities.require<MyType>('credentials')
```

which let the caller assert any type and duplicated scope metadata across definitions.

The hardened shape uses:

```ts
CapabilityToken<T, Scope>
```

binding stable service key + semantic value type + authority scope.

Thin helpers may type Cordis `get/provide`, but Cordis remains the only resolver/registry.

### 2. Scope-local composition identity

MR-A initially used one whole-plan fingerprint for canonical Tenant/Principal definition identity. This was safe but over-coupled: an Operation-only change could falsely invalidate an unrelated Tenant.

The hardened Plan keeps:

```text
fingerprint                  exact whole-plan identity
scopeFingerprints[scope]     scope provider dependency closure
```

Canonical Tenant/Principal definitions use their scope-local closure identity.

**M3.5 exit gate:**

- Operation-only drift does not invalidate unrelated Principal/Tenant nodes;
- Principal-only drift does not invalidate unrelated Tenant nodes;
- ancestor changes actually used by a scope do change that scope identity;
- typed capability consumption is proven from source and packed artifact;
- docs/roadmap clearly separate Product Ingress, Runtime Capability and Agent Integration planes.

---

# Next product-facing stage

The earlier Roadmap grouped Authenticated Identity, Credentials and MCP as three parallel capability contracts. MR-A showed this is not structurally accurate, so M4/M5 are revised.

## M4 — Product Ingress + Principal Capability Contracts

M4 proves two different boundaries together because they meet at canonical Principal selection.

### A. Trusted Product Ingress

```text
authenticated product subject
        ↓
identity resolver
        ↓
TenantPrincipal
        ↓
canonical Tenant / Principal
```

The Framework does **not** own JWT/OAuth/OIDC/SAML parsing. It owns only the semantic boundary after the product has established trusted identity.

The first reference adapter should be simple/callback based and exist only to prove the contract.

### B. Principal Credentials Capability

Credentials become the first real product-facing typed Runtime capability.

It must prove:

- Tenant isolation;
- Principal sibling isolation;
- lifecycle ownership;
- typed consumption;
- replacement without Framework Core edits;
- no secret state leaking into deployment/root authority by accident.

**M4 exit gate:** Product Ingress selects the correct canonical Principal and that Principal consumes a replaceable typed Credentials capability without vendor-specific auth logic entering the Core.

## M5 — Agent Integration Reference Path + Minimal Defaults

MCP moves from “parallel Runtime capability” to the strongest reference **Agent Integration** path.

The target path is:

```text
Tenant MCP configuration
        +
Principal credentials
        +
Operation snapshot
        ↓
Agent integration
        ↓
DSH Agent setup
        ↓
@deepseek-ai/dsh-mcp-client
        ↓
native DSH MCP tools
```

At the current pinned DSH baseline, MCP Tools are the supported Harness bridge. Resources and Prompts are not bridged by the Harness, so v0.3 does not build a parallel compatibility protocol to simulate them.

M5 should include only enough defaults to make this path real:

- one simple identity adapter from M4;
- one in-memory/reference Credentials implementation;
- one real MCP Tools integration path;
- replacement proof for at least one implementation.

**M5 exit gate:** one realistic Product Ingress -> Tenant/Principal -> Credentials -> Operation -> DSH-native MCP Tool path works end to end, and replacing a conforming implementation does not require Core changes.

At the end of M5, package boundaries are reevaluated from evidence.

---

## M6 — Diagnostics and Explainability

A Composition Framework must explain itself.

It should answer:

- which provider was selected and why;
- which typed capability/scope owns it;
- what its dependency closure is;
- why a Definition/provider/integration was rejected;
- which scope fingerprint controls canonical identity;
- where bootstrap failed;
- what the normalized Plan contains.

Diagnostics may begin naturally during M3.5/M4/M5, but M6 hardens them into a deliberate framework contract.

## M7 — Conformance and Compatibility Hardening

Expand executable evidence across:

- typed capability identity;
- Composition validation and determinism;
- scope-local canonical drift;
- Tenant/Principal isolation and recreation;
- Operation prepare/active/cancel/failure/teardown/provider churn;
- Product Ingress identity mapping;
- Credentials replacement/failure;
- Agent Integration create/resume/setup/failure;
- DSH-native MCP Tools behavior;
- Node 22.19 / Node 24;
- pinned DSH/Cordis assumptions;
- packed consumer behavior.

GitHub Actions remains upstream truth detector, architecture gate and regression firewall.

## M8 — v0.3 Release Convergence

No new architecture should be invented here.

Release convergence means:

- remove research/intermediate surfaces that did not become architecture;
- freeze only earned public/package boundaries;
- align README/spec/reference docs with actual code;
- publish explicit compatibility/security boundaries;
- run packed and registry consumer smoke;
- keep install/distribution mechanics minimal unless the released contract truly needs more.

---

# v0.3 Golden Test

The final acceptance should resemble a real SaaS product flow:

```text
Trusted Product Request
        ↓
Tenant Acme / Alice
│       ├─ Credentials A
│       └─ Tenant MCP config A
│
├─ Tenant Acme / Bob
│       ├─ Credentials B
│       └─ Tenant MCP config A
│
└─ Tenant Globex / Alice
        ├─ Credentials C
        └─ Tenant MCP config B
```

Concurrent Operations must prove each DSH Agent/integration sees only the correct identity, Tenant config and Principal credential; disposing/failing/recreating one scope must not affect siblings or other Tenants.

The same acceptance suite must feed invalid definitions and prove they fail before user traffic.

# v0.3 Definition of Done

v0.3 is complete only when all are true:

1. typed `SaaSDefinition -> CompositionPlan` is deterministic and fail-fast. ✅ after M3.5
2. canonical identity is scope-local rather than falsely coupled to unrelated descendants. ✅ after M3.5
3. one user-visible action has one semantic Operation boundary; A6 is proven. ✅
4. Principal -> Operation -> real DSH create/resume/failure is executable CI evidence. ✅
5. Product Ingress maps trusted identity to canonical Runtime without vendor auth entering Core.
6. a Principal-owned typed Credentials contract proves replacement/isolation.
7. at least one DSH-native Agent Integration path is genuinely usable end to end.
8. semantic diagnostics explain Plan selection/locality and failures.
9. platform assumptions/provider/integration contracts are executable on supported baselines.
10. package boundaries reflect proven independent value rather than speculative names.
11. current docs/install instructions describe the artifact users actually receive.

# Explicit v0.3 non-goals

Not required for v0.3:

- broad OAuth/OIDC/SAML vendor integrations;
- production Vault/Redis/Postgres credential ecosystems;
- a parallel MCP protocol stack;
- compatibility shims for MCP Resources/Prompts that DSH does not currently consume;
- billing/audit/usage products;
- Web admin UI;
- Marketplace/discoverability work;
- Distribution/Profile polish beyond released contract needs;
- one-tenant-per-Pod orchestration;
- arbitrary dynamic provider hot reconfiguration;
- a large migration/provider ecosystem.

---

# v0.4 preview — Production Provider Ecosystem & Productization

v0.4 turns stable v0.3 boundary contracts into a broader production-ready SaaS ecosystem.

Expected direction includes production identity integrations, durable credentials/secrets, richer MCP capabilities as DSH exposes stable consumers, operational providers, durable stores/migrations, stronger deployment profiles and improved Distribution/install experience.

This remains a **preview, not a detailed v0.4 roadmap**. Exact scope comes from v0.3 architecture and real usage evidence.

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
