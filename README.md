[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Make [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) a real **Multi-Tenant Runtime** and grow it into a composable **SaaS Framework Core** without replacing the DSH/Cordis architecture underneath.

> **Published foundation:** `dsh-multi-tenant@0.2.0-rc.3` — canonical Tenant/Principal Runtime Contract + frozen ownership kernel.
>
> **Active development line:** **v0.3 SaaS Framework Core**. The M1–M3 Core Vertical Slice is now implemented: deterministic CompositionPlan, Principal-owned one-shot Operations, and real DSH Agent create/resume/failure evidence.
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

v0.1 answered **who owns a Session**. v0.2 answered **what Tenant and Principal are in the Runtime**. v0.3 answers **how a SaaS product declares, validates and executes replaceable capabilities through that Runtime**.

## v0.3 north star

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

The core guarantees already established by M1–M3 are:

- invalid composition fails before Runtime traffic;
- equivalent definitions normalize deterministically;
- structurally different Plans cannot silently share an active canonical Tenant/Principal;
- declared Tenant/Principal/Operation scope corresponds to a real Cordis ownership boundary;
- Tenant and Principal capability state stays isolated;
- one user-visible action maps to one non-reactive semantic Operation;
- provider churn cannot re-enter or duplicate Operation work;
- Principal teardown closes admission and drains its Operations;
- DSH create/resume receives the correct Operation/Principal-derived `ownerCtx`;
- DSH/provider failure is preserved causally while Operation cleanup still completes;
- the packed npm artifact executes the same Composition/Operation contract as source CI.

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
│   │       └── immutable snapshot -> DSH Agent
│   └── Principal(bob)
│
└── Tenant(globex)
```

The project keeps four planes separate:

1. **Persistent authorization** — durable `(tenantId, userId) -> session` ownership, always fail closed.
2. **Tenant/Principal/Operation capability ownership** — native Cordis Context/Fiber lifecycle and service isolation.
3. **Agent/Preset registration graph** — native DSH `@deepseek-ai/dsh-scope` for Agent-local tools/prompts/listeners.
4. **Strong deployment isolation** — process/container/Pod boundaries when same-process trust is insufficient.

The SaaS layer composes these planes; it does not copy Cordis internals into Agent scope and does not create a second DI container.

## Composition compiler

`dsh-multi-tenant/composition` separates mutable intent from executable structure:

```ts
const plan = compileSaaSDefinition({
  capabilities: [
    { key: 'agents', scope: 'deployment', required: true },
    { key: 'tenantMcp', scope: 'tenant', required: true },
    { key: 'credentials', scope: 'principal', required: true },
  ],
  providers: [
    { id: 'dsh-agents', capability: 'agents', scope: 'deployment' },
    {
      id: 'tenant-mcp',
      capability: 'tenantMcp',
      scope: 'tenant',
      setup({ ctx }) {
        ctx.provide('tenantMcp', createTenantMcp())
      },
    },
    {
      id: 'credentials',
      capability: 'credentials',
      scope: 'principal',
      requires: ['tenantMcp'],
      setup({ ctx }) {
        ctx.provide('credentials', loadPrincipalCredentials())
      },
    },
  ],
})
```

The compiler resolves selection, dependency visibility, cycles, scope placement and bootstrap order. A deterministic Plan fingerprint becomes part of canonical Runtime definition identity, so structurally different compositions fail instead of silently joining the same active node.

Ambient providers are deployment-only. Tenant/Principal/Operation providers must actually materialize in their declared scope.

## One-shot Operations

Cordis `ctx.inject()` is reactive and intentionally reruns when dependencies disappear and return. That is useful plugin lifecycle semantics, but it cannot define one user transaction.

v0.3 therefore uses a Principal-owned non-reactive Operation:

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinitionFromPlan(plan))
const alice = await tenant.principals.ensure('alice', principalDefinitionFromPlan(plan))

const operation = alice.operations.start({
  ...operationDefinitionFromPlan(plan),
  requires: ['agents', 'tenantMcp', 'credentials'],
  async execute({ capabilities, signal }) {
    const agents = capabilities.require<any>('agents')
    const credentials = capabilities.require('credentials')

    return agents.create({
      sessionId,
      signal,
      setup(agentCtx) {
        // Compose DSH-native Agent/Preset scope here.
      },
    })
  },
})

const handle = await operation.result
```

Operation setup resolves required Cordis capabilities exactly once into an immutable snapshot, then calls `execute()` once. Provider churn may make a captured provider unusable, but it never causes semantic work to rerun. This is assumption `A6`, now proven on Node 22.19 and Node 24 against the pinned public DSH AgentRegistry.

## Provider ecosystem direction

`dsh-multi-tenant/testing` exposes executable provider conformance for Tenant/Principal capability isolation. M4/M5 will now add the smallest real SaaS contracts needed to prove the ecosystem model, prioritizing:

- Authenticated Identity Boundary;
- Credentials capability;
- MCP capability;
- minimal replaceable reference providers.

These are capability responsibilities, not pre-approved package names.

### Package-boundary decision after M3

**No new `dsh-saas` package yet.** Composition + Operation currently extend the same Runtime ownership contract and do not justify a separate versioning/distribution boundary.

A new package will appear only if M4/M5 produces an independently useful consumer API, replacement/lifecycle boundary, release boundary or Distribution boundary. Until then, keeping one package preserves architectural freedom and reduces noise.

## v0.3 roadmap at a glance

```text
M0  P0 Spec / Assumption Foundation          ✅
M1  Composition Compiler                     ✅
M2  Operation Kernel + A6                    ✅
M3  Multi-tenant DSH vertical slice          ✅
    └─ package boundary: keep one package
M4  Minimal Auth / Credentials / MCP contracts   ← next
M5  Minimal reference providers
M6  Diagnostics / explainability
M7  Conformance + compatibility hardening
M8  v0.3 release convergence
```

See [ROADMAP.md](./ROADMAP.md) for the complete release definition and [docs/specs](./docs/specs) for live contracts.

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
- **Prerelease freedom.** We do not preserve early shapes when they obstruct the better long-term model.

## Compatibility evidence

GitHub Actions currently verifies on Node 22.19 and Node 24:

- exact upstream DSH release identity;
- DSH Session setup/publication/rollback;
- caller-bound DSH Agent owner context;
- Cordis parent/child teardown;
- Cordis reactive injection behavior;
- Runtime capability provider isolation;
- SaaSDefinition -> CompositionPlan -> Tenant/Principal -> one-shot Operation -> real DSH Agent create/resume/failure;
- packed external-consumer installation and execution.

The machine-readable ledger lives at [`docs/specs/v0.3-assumptions.json`](./docs/specs/v0.3-assumptions.json). `A1`–`A6` are currently proven.

## Explicit security boundary

Cordis Context is a trusted same-process composition/lifecycle boundary, not a hostile-code sandbox. It does not isolate process memory, filesystem, shell, network, environment variables or malicious same-process plugins.

Strong isolation belongs to process/container/Pod deployment profiles.

## v0.4 preview

v0.4 is expected to turn the v0.3 Framework Core into a broader **Production Provider Ecosystem & Productization** stage: production identity providers, durable secrets/credentials, richer MCP integrations, operational providers, durable stores/migrations, stronger deployment profiles and a more polished Distribution/install experience.

This is intentionally only a preview; the detailed v0.4 roadmap will be based on v0.3 architecture and real usage evidence.

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
