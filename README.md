[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Make [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) a real **Multi-Tenant Runtime** while preserving a small, auditable security kernel.

> **Current line: `0.2.0-rc.3`.** v0.1 is the frozen ownership/authorization kernel. v0.2 is the canonical Tenant/Principal Runtime Contract that the upcoming SaaS Framework will compose rather than rewrite.
>
> **Current DSH compatibility baseline:** `0.1.1-rc.2` at upstream release commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. The version is explicitly pinned and manually advanced; CI never follows floating `latest` or `master`.

## Architecture

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

A canonical Principal Context is a capability/composition root. Operations that need additional services run in a Principal-derived integration fiber with explicit Cordis injection. For Agent creation the structural path is:

```text
Principal Runtime
      ↓
Principal-derived integration fiber
  inject: agents
      ↓
ownerCtx.agents.create(...)
      ↓
DSH Agent setup / Agent scope
```

This preserves both planes instead of pretending `Agent.ctx` directly inherits the tenant service-isolation graph.

## v0.1 is frozen

The published v0.1 line remains the security kernel:

- minimal authenticated `TenantPrincipal`;
- claim-once immutable session ownership;
- fail-closed access decisions;
- replaceable `TenantSessionStore` provider seam.

Those guarantees remain deployment-global inside v0.2 as defense in depth.

## v0.2 Runtime Contract

Tenant and Principal share one structural vocabulary:

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinition)
const alice = await tenant.principals.ensure('alice', principalDefinition)
```

Both levels are canonical runtime nodes with immutable identity, scoped Context, explicit lifecycle state, idempotent quiescent disposal, and canonical `ensure/get` registries.

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

Preparing transactions are first-class lifecycle resources. Registry teardown closes admission, cancels unpublished creations, then drains published scopes. Partial graphs are never visible; concurrent `ensure()` calls single-flight; setup failure rolls back; definition drift fails explicitly.

## Provider ecosystem

`dsh-multi-tenant/testing` exposes an executable Runtime Capability Provider Contract. Provider authors can prove same-name A/B isolation, root/parent non-leakage, descendant inheritance, sibling non-interference, disposal isolation, clean recreation, and unpublished setup ownership.

That contract is the base of the future Plugin Family: the SaaS Framework may ship opinionated defaults while every capability slot remains replaceable.

## Engineering principles

- **Structure before patches** — design ownership, data structures and state transitions so correct behavior grows naturally.
- **Strong semantic types** — use TypeScript types/generics to encode lifecycle and identity meaning rather than passing loosely related fields.
- **Control -> enforce** — fail closed where this repository owns the boundary.
- **Ecosystem -> standardize** — define executable provider/integration contracts instead of absorbing every implementation.
- **Outside control -> bound** — Cordis Context is not a hostile-code or process sandbox.
- **No prerelease compatibility debt** — break early APIs when a better long-term abstraction exists.
- **No second DI container** — capability resolution belongs to Cordis Context.

## Compatibility evidence

CI proves the selected DSH baseline in two independent ways:

- checks out the exact upstream DSH release commit and verifies its root package version;
- runs executable session genesis, admission/publication and Agent owner/composition probes against the exact published npm packages.

The baseline is explicit and manually refreshed when we choose to move DSH forward.

## Packages

| Package | Distribution | Role |
| --- | --- | --- |
| [`packages/multi-tenant`](./packages/multi-tenant) | npm `dsh-multi-tenant` (`latest`) | v0.2 Runtime Contract + frozen v0.1 ownership kernel. |
| [`packages/multi-tenant-web`](./packages/multi-tenant-web) | private workspace | Experimental Web/API enforcement research; production transport composition belongs to the SaaS Framework stage. |

See [ROADMAP.md](./ROADMAP.md), [`docs/releases/v0.2.0-rc.3.md`](./docs/releases/v0.2.0-rc.3.md), and [CONTRIBUTING.md](./CONTRIBUTING.md).

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

`latest` always represents the newest version this project has intentionally published. We do not maintain a separate prerelease dist-tag during the current rapid-iteration phase.

## Development

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

## License

MIT
