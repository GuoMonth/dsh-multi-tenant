[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Make [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) a real **Multi-Tenant Runtime** and grow it into a composable **SaaS Framework Core** without replacing the DSH/Cordis architecture underneath.

> **Published foundation:** `dsh-multi-tenant@0.2.0-rc.3` — canonical Tenant/Principal Runtime Contract + frozen ownership kernel.
>
> **Active development line:** **v0.3 SaaS Framework Core**. M1–M3 established typed composition, Principal-owned one-shot Operations and real DSH Agent create/resume/failure evidence. The current hardening pass is removing over-coupled composition identity before product-facing capabilities are added.
>
> **Current DSH compatibility baseline:** `0.1.1-rc.2` at upstream release commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. CI never follows floating `latest` or `master`.

## Version direction

```text
v0.1  Security Kernel
  ↓
v0.2  Multi-Tenant Runtime Contract       published
  ↓
v0.3  SaaS Framework Core                active development
  ↓
v0.4  Production Provider Ecosystem      preview
```

v0.1 answered **who owns a Session**. v0.2 answered **what Tenant and Principal are in the Runtime**. v0.3 answers **how a SaaS product enters, composes and executes through that Runtime without flattening product identity, runtime capabilities and Agent integration into one mechanism**.

## v0.3 north star

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

The important distinction is that these are **different semantic planes**:

- Product ingress decides which trusted `TenantPrincipal` enters the Runtime;
- Runtime capabilities live under Deployment/Tenant/Principal/Operation ownership;
- an Operation snapshots the capabilities required for one semantic action;
- Agent integration translates that trusted Runtime view into native DSH Agent/Preset/plugin composition.

See [`docs/specs/saas-boundaries.md`](./docs/specs/saas-boundaries.md).

## Current runtime shape

```text
Deployment / Root
│
├── shared TenantSessionStore          persistent ownership storage
├── shared MultiTenantService         fail-closed authorization kernel
├── shared TenantRuntimeService
│
├── Tenant(acme)                      canonical capability node
│   ├── tenant capabilities
│   ├── Principal(alice)              canonical capability node
│   │   ├── principal capabilities
│   │   └── Operation                 ephemeral, one-shot
│   │       ├── operation capabilities
│   │       └── typed immutable snapshot -> DSH Agent integration
│   └── Principal(bob)
│
└── Tenant(globex)
```

Persistent authorization, Runtime capability ownership, DSH Agent/Preset registration and strong process/container isolation remain separate concerns.

## Typed capabilities

v0.3 no longer represents capability identity as unrelated string + scope fields.

```ts
import { defineCapability, provideCapability } from 'dsh-multi-tenant'

const tenantMcpConfig = defineCapability<TenantMcpConfig, 'tenant'>(
  'tenantMcpConfig',
  'tenant',
)
const credentials = defineCapability<Credentials, 'principal'>(
  'credentials',
  'principal',
)
```

`CapabilityToken<T, Scope>` binds:

```text
stable key + value type + lifecycle/authority scope
```

It is only a typed semantic identity over a Cordis service key. Cordis still owns service resolution and lifecycle; there is no second DI container.

## Composition compiler

`dsh-multi-tenant/composition` separates mutable intent from executable structure:

```ts
const plan = compileSaaSDefinition({
  capabilities: [
    { capability: agents, required: true },
    { capability: tenantMcpConfig, required: true },
    { capability: credentials, required: true },
  ],
  providers: [
    { id: 'dsh-agents', capability: agents },
    {
      id: 'tenant-mcp-config',
      capability: tenantMcpConfig,
      setup({ ctx }) {
        provideCapability(ctx, tenantMcpConfig, loadTenantMcpConfig())
      },
    },
    {
      id: 'credentials',
      capability: credentials,
      requires: [tenantMcpConfig],
      setup({ ctx }) {
        provideCapability(ctx, credentials, loadPrincipalCredentials())
      },
    },
  ],
})
```

The compiler resolves provider selection, dependency visibility, cycles and bootstrap order before traffic.

### Composition locality

A Plan now has two identity levels:

```text
plan.fingerprint
  exact whole-plan identity / diagnostics

plan.scopeFingerprints
  Deployment/Tenant/Principal/Operation dependency-closure identity
```

Canonical Tenant and Principal nodes use their scope-local fingerprint. Therefore an Operation-only provider change no longer falsely invalidates an unrelated Tenant/Principal, while a change to a provider actually participating in Tenant creation still produces `RuntimeDefinitionConflictError`.

This is intentionally different from hot reconfiguration: v0.3 still does not mutate an active canonical creation recipe in place.

## One-shot Operations

Cordis `ctx.inject()` is reactive and intentionally reruns when dependencies disappear and return. That is plugin lifecycle semantics, not one user transaction.

v0.3 therefore uses a Principal-owned non-reactive Operation:

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinitionFromPlan(plan))
const alice = await tenant.principals.ensure('alice', principalDefinitionFromPlan(plan))

const operation = alice.operations.start({
  ...operationDefinitionFromPlan(plan),
  requires: [agents, credentials],
  async execute({ capabilities, signal }) {
    const dshAgents = capabilities.require(agents)
    const credential = capabilities.require(credentials)

    return dshAgents.create({
      sessionId,
      signal,
      setup(agentCtx) {
        // Native DSH Agent/Preset/plugin composition belongs here.
      },
    })
  },
})

const handle = await operation.result
```

The token determines the TypeScript value type returned from the snapshot. Required capabilities are captured exactly once before `execute()`; provider churn cannot re-enter semantic work.

## What the next stage is actually proving

The next stage is no longer described as three peer “Auth / Credentials / MCP Providers”. MR-A showed they live at different boundaries.

### M4 — Product Ingress + Principal Capability contracts

- **Trusted identity resolution**: authenticated product subject -> `TenantPrincipal` -> canonical Runtime topology;
- **Credentials**: first real Principal-owned typed Runtime capability;
- replacement/lifecycle/isolation contract, without JWT/OAuth vendor logic entering Core.

### M5 — Agent Integration reference path

- consume Tenant config + Principal credentials + Operation snapshot;
- compose those into DSH-native Agent setup;
- use the official `@deepseek-ai/dsh-mcp-client` as the first reference integration for MCP **Tools**;
- do not build a parallel MCP protocol stack or bridge Resources/Prompts that the pinned Harness itself does not consume.

This produces one realistic Product Ingress -> Principal -> Capability -> Operation -> Agent Integration -> DSH path before broader diagnostics/hardening.

## Package-boundary decision

**Still one package.** No `dsh-saas`, Auth package or MCP package is created by architectural anticipation.

A package appears only after an independent consumer API, replacement/lifecycle boundary, release cadence or Distribution boundary is demonstrated by real implementation.

## v0.3 roadmap at a glance

```text
M0    Spec / Assumption Foundation                         ✅
M1    Composition Compiler                                 ✅
M2    Principal Operation Kernel + A6                      ✅
M3    Multi-tenant real-DSH Core Vertical Slice            ✅
M3.5  Post-MR-A architecture hardening                     ← current
      typed capabilities + scope-local composition identity
M4    Product Ingress + Principal Capability contracts
M5    Agent Integration reference path + minimal defaults
M6    Diagnostics / explainability
M7    Conformance + compatibility hardening
M8    v0.3 release convergence
```

See [ROADMAP.md](./ROADMAP.md) for the detailed release definition.

## Engineering method

```text
Spec
  → Assumption Ledger
  → executable external probe / contract test
  → strong types + state model
  → failing behavior test
  → smallest implementation
  → vertical-slice CI proof
```

Rules that matter:

- **Structure before patches.** Refactor ownership/data/state so features grow naturally.
- **Strong semantic types.** Invalid topology should be hard or impossible to express.
- **Assumption-first verification.** DSH/Cordis behavior is evidence, not folklore.
- **Relevance over correctness theater.** Delete technically valid surfaces when they no longer serve the architecture.
- **Control -> enforce; ecosystem -> standardize; outside control -> explicit boundary.**
- **No second DI container.** Cordis remains the service/lifecycle substrate.
- **No speculative package topology.** Package boundaries must be earned.
- **Prerelease freedom.** Early API shapes are disposable when they obstruct the better model.

## Compatibility evidence

GitHub Actions verifies on Node 22.19 and Node 24:

- exact upstream DSH release identity;
- DSH Session setup/publication/rollback;
- caller-bound DSH Agent owner context;
- Cordis parent/child teardown and reactive injection behavior;
- Runtime capability provider isolation;
- typed SaaSDefinition -> CompositionPlan -> Tenant/Principal -> Operation -> real DSH create/resume/failure;
- packed external-consumer installation, typed snapshot and composition-locality behavior.

The machine-readable ledger lives at [`docs/specs/v0.3-assumptions.json`](./docs/specs/v0.3-assumptions.json). `A1`–`A6` are proven.

## Explicit security boundary

Cordis Context is a trusted same-process composition/lifecycle boundary, not a hostile-code sandbox. It does not isolate process memory, filesystem, shell, network, environment variables or malicious same-process plugins.

Strong isolation belongs to process/container/Pod deployment profiles.

## v0.4 preview

v0.4 is expected to turn the v0.3 Framework Core into a broader **Production Provider Ecosystem & Productization** stage: production identity integrations, durable secrets/credentials, richer MCP integrations, operational providers, durable stores/migrations, stronger deployment profiles and more polished Distribution/install experience.

The detailed v0.4 roadmap will be based on v0.3 architecture and real usage evidence.

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

Marketplace/custom installer work is not on the current critical path. npm + the DSH-native bundle path is the supported baseline.

## Development

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

## License

MIT
