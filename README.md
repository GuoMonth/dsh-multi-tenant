[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Make [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) a real **Multi-Tenant Runtime** and grow it into a composable **SaaS Framework Core** without replacing the DSH/Cordis architecture underneath.

> **Published foundation:** `dsh-multi-tenant@0.2.0-rc.3` — canonical Tenant/Principal Runtime Contract + frozen ownership kernel.
>
> **Active development line:** **v0.3 SaaS Framework Core** — typed composition, fail-fast validation, Principal-owned one-shot Operations, replaceable capabilities and executable DSH/Cordis assumptions.
>
> **Current DSH compatibility baseline:** `0.1.1-rc.2` at upstream release commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. Baselines are explicit and manually advanced; CI never follows floating `latest` or `master`.

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

v0.1 answered **who owns a Session**. v0.2 answered **what Tenant and Principal are in the Runtime**. v0.3 now answers **how a SaaS product declares, validates and executes replaceable capabilities through that Runtime**.

## What v0.3 is building

v0.3 is not a feature-count release and is not a plan to build one monolithic SaaS plugin. Its goal is an executable Framework Core with one stable path:

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

The release is complete only when this path is strongly typed, fail-fast, lifecycle-safe and executable in CI across multiple tenants/principals.

The key guarantees we are working toward are:

- invalid capability composition fails before user traffic;
- Tenant and Principal capability state remains isolated under concurrency, failure and teardown;
- one user-visible action maps to one semantic Operation and dependency churn cannot silently duplicate externally visible work;
- Principal teardown drains its Operations;
- DSH Agent create/resume receives the correct Principal-derived `ownerCtx`;
- provider implementations are replaceable without rewriting the Framework Core;
- assumptions about DSH/Cordis are machine-readable and executable in GitHub Actions.

The detailed milestone roadmap and v0.3 Definition of Done live in [ROADMAP.md](./ROADMAP.md).

## v0.3 roadmap at a glance

```text
M0  P0 Spec / Assumption Foundation          ✅
M1  Composition Compiler
M2  Operation Kernel + resolve A6
M3  Fake-provider end-to-end vertical slice
    └─ package-boundary decision gate
M4  Minimal Auth / Credentials / MCP contracts
M5  Minimal reference providers
M6  Diagnostics / explainability
M7  Conformance + compatibility hardening
M8  v0.3 release convergence
```

A critical current gate is **A6**: the final Operation design must prove that Cordis dependency reactivity cannot cause duplicate externally visible user work. The Operation public API stays unfrozen until that proof exists.

## Architecture foundation

```text
Deployment / Root
│
├── shared TenantSessionStore
├── shared MultiTenantService          persistent authorization invariant
├── shared TenantRuntimeService
│
├── Tenant(acme)                       canonical runtime node
│   ├── tenant capability graph
│   ├── Principal(alice)               canonical runtime node
│   │   └── principal capability graph
│   └── Principal(bob)
│
└── Tenant(globex)
```

The project separates four planes instead of overloading one tenant mechanism:

1. **Persistent authorization** — durable `(tenantId, userId) -> session` ownership; always fail closed.
2. **Tenant/Principal capability graph** — Cordis Context service isolation and lifecycle.
3. **Agent/Preset registration graph** — DSH `@deepseek-ai/dsh-scope`; tools, prompts, listeners and Agent-local visibility.
4. **Strong deployment isolation** — process/filesystem/network/shell boundaries such as one tenant per container/Pod when required.

The v0.3 Framework grows **above** this structure. It does not copy Cordis internals into Agent scope and does not create a second DI/service registry.

## v0.1 frozen kernel

The v0.1 security guarantees remain intentionally small:

- minimal authenticated `TenantPrincipal`;
- claim-once immutable session ownership;
- fail-closed access decisions;
- replaceable `TenantSessionStore` provider seam.

These guarantees remain deployment-global defense in depth.

## v0.2 Runtime Contract

Tenant and Principal share one structural vocabulary:

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinition)
const alice = await tenant.principals.ensure('alice', principalDefinition)
```

Both are canonical runtime nodes with immutable identity, scoped Context, explicit lifecycle state, idempotent quiescent disposal and canonical `ensure/get` registries.

Creation is transactional:

```text
reserve canonical identity
        ↓
prepare unpublished Cordis subtree
        ↓
await setup(signal)
        ↓
optional synchronous commit()
        ↓
publish active node
```

Preparing transactions are first-class lifecycle resources. Partial graphs are never visible; concurrent `ensure()` calls single-flight; setup failure rolls back; definition drift fails explicitly.

## Provider ecosystem direction

`dsh-multi-tenant/testing` exposes an executable Runtime Capability Provider Contract covering A/B isolation, root/parent non-leakage, descendant inheritance, sibling non-interference, disposal isolation, recreation and unpublished setup ownership.

v0.3 builds on that principle: **provider compatibility is a contract, not an assumption**.

Capability names such as Auth, Credentials, MCP, Transport, Audit and Usage are responsibilities, not pre-created package names. A package is introduced only when a real independent contract, replacement boundary, lifecycle boundary, release boundary or Distribution boundary has been demonstrated.

## Engineering method

v0.3 work follows one development sequence:

```text
Spec
  → Assumption Ledger
  → executable external probe / contract test
  → strong types + state model
  → failing behavior test
  → smallest implementation
  → vertical-slice CI proof
```

Core principles:

- **Structure before patches** — ownership, data structures and state transitions first.
- **Strong semantic types** — make invalid states difficult or impossible to represent.
- **Assumption-first verification** — external DSH/Cordis behavior must be executable evidence before public API depends on it.
- **Relevance over correctness theater** — technically valid historical experiments do not stay live when they no longer serve the architecture.
- **Control -> enforce; ecosystem -> standardize; outside control -> explicit boundary.**
- **No second DI container** — Cordis remains the service/lifecycle substrate.
- **No speculative package topology** — package boundaries follow proven architecture.

See [CONTRIBUTING.md](./CONTRIBUTING.md) and the P0 specs under [`docs/specs`](./docs/specs).

## Compatibility evidence

CI currently verifies the platform seams the active architecture depends on:

- exact upstream DSH release identity;
- DSH session setup/publication/rollback behavior;
- Principal-derived DSH Agent owner/context composition;
- Cordis parent/child lifecycle behavior;
- Cordis reactive dependency injection behavior;
- Runtime capability provider isolation contract.

Open blocking assumptions are tracked in [`docs/specs/v0.3-assumptions.json`](./docs/specs/v0.3-assumptions.json) instead of being hidden in implementation code.

## Current package

[`packages/multi-tenant`](./packages/multi-tenant) is currently the only live workspace package and is published as npm `dsh-multi-tenant` (`latest`). It contains the v0.2 Runtime Contract and frozen v0.1 ownership kernel.

v0.3 does not pre-create `saas`, Auth, MCP or provider packages. The implementation will decide package boundaries only after their independent value is demonstrated.

## v0.4 preview

v0.4 is expected to turn the v0.3 Framework Core into a broader **production provider ecosystem and productized SaaS experience**: production identity integrations, durable credentials/secrets, richer MCP integrations, audit/usage/observability, durable stores and migrations, stronger deployment profiles, and a more polished out-of-box Distribution/install experience.

This is intentionally only a preview. The detailed v0.4 roadmap will be based on the architecture and real usage evidence produced by v0.3.

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

The current stage does not require Marketplace or custom installer work. npm + the DSH-native plugin/bundle path is the supported installation baseline.

## Development

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

## License

MIT
