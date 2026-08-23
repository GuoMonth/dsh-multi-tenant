[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Make [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) a real **Multi-Tenant Runtime** while preserving a small, auditable security kernel.

> **Current line: `0.2.0-rc.2`.** Published v0.1 tags are frozen historical contracts. v0.1 owns immutable session ownership and fail-closed authorization. v0.2 builds a canonical Tenant/Principal runtime tree above that kernel so the future SaaS Framework can compose providers and transports without rewriting the runtime foundation.

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

The project intentionally separates four planes:

1. **Persistent authorization** — durable `(tenantId, userId) -> session` ownership; always fail closed.
2. **Tenant/Principal capability graph** — Cordis Context service isolation and lifecycle.
3. **Agent/Preset registration graph** — DSH `@deepseek-ai/dsh-scope`; tools/prompts/listeners and Agent-local visibility.
4. **Strong deployment isolation** — process/filesystem/network/shell boundaries such as one tenant per container/Pod when required.

Capability authority and Agent registration visibility are intentionally different structures. A Principal Context is the owner/composition boundary for `ctx.agents.create()`; Agent setup explicitly projects/composes what the Agent needs instead of pretending `Agent.ctx` directly inherits the tenant service graph.

## v0.1 is frozen

The published v0.1 line remains the security kernel:

- minimal authenticated `TenantPrincipal`;
- claim-once immutable session ownership;
- fail-closed access decisions;
- replaceable `TenantSessionStore` provider seam.

Those guarantees remain deployment-global inside v0.2 as defense in depth.

## v0.2 runtime contract

Tenant and Principal use one structural vocabulary:

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinition)
const alice = await tenant.principals.ensure('alice', principalDefinition)
```

Both levels are canonical runtime nodes with immutable identity, scoped Context, `state`, idempotent `dispose()`, and `ensure/get` registries.

Creation is transactional:

```text
reserve canonical key
        ↓
unpublished Cordis subtree
        ↓
await setup
        ↓
optional synchronous commit()
        ↓
publish active node
```

So partial Tenant/Principal graphs are never visible. Concurrent `ensure()` calls single-flight; failed setup rolls back; active definition drift fails explicitly; Tenant teardown drains Principals before itself.

## Provider ecosystem

`dsh-multi-tenant/testing` exposes an executable Tenant-Safe Provider Contract. Provider authors can prove same-name A/B isolation, parent/root non-leakage, descendant inheritance, sibling non-interference, disposal isolation, and clean recreation.

This is the intended foundation for the future Plugin Family: opinionated defaults can be supplied by a SaaS distribution while each capability slot remains replaceable by a provider that satisfies the same contract.

## Guiding principles

- **Control -> enforce** — fail-closed invariants where this repository owns the boundary.
- **Ecosystem -> standardize** — define executable provider/transport contracts instead of absorbing every implementation.
- **Outside control -> bound** — Cordis Context is not a hostile-code or process sandbox.
- **Structure before patches** — prefer data/ownership structures that make invalid states unrepresentable.
- **No compatibility debt during prerelease** — break an early API when a better long-term abstraction is available.
- **No second DI container** — capability resolution belongs to Cordis Context.

## Packages

| Package | Distribution | Role |
| --- | --- | --- |
| [`packages/multi-tenant`](./packages/multi-tenant) | npm `dsh-multi-tenant@next` | v0.2 Runtime Contract + frozen v0.1 ownership kernel: `ctx.tenantRuntime`, `ctx.multiTenant`, `ctx.tenantSessionStore`. |
| [`packages/multi-tenant-web`](./packages/multi-tenant-web) | private workspace | Experimental Web/API enforcement research; product transport composition moves to the SaaS Framework stage. |

See [ROADMAP.md](./ROADMAP.md), [`docs/releases/v0.2.0-rc.2.md`](./docs/releases/v0.2.0-rc.2.md), and [CONTRIBUTING.md](./CONTRIBUTING.md).

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm release:check
```

## License

MIT
