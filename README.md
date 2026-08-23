[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Make [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) a real **Multi-Tenant Runtime** while preserving a small, auditable security kernel.

> **Current line: `0.2.0-rc.1`.** Published v0.1 tags are frozen historical contracts. v0.1 owns immutable session ownership and fail-closed authorization; v0.2 adds context-native Tenant/Principal capability scopes above that kernel. The executable DSH compatibility closure stays on the proven **`0.1.0-rc.7`** pin in this PR; current upstream `0.1.1-rc.2` scope behavior was reviewed separately.

## Architecture

```text
Deployment / Root Context
│
├── shared TenantSessionStore
├── shared MultiTenantService        <- persistent authorization invariant
├── shared TenantRuntimeService
│
├── Tenant A Cordis Context          <- capability graph
│   ├── tenant-local auth / MCP / providers
│   └── Principal A Context
│       └── user-local credentials
│
└── Tenant B Cordis Context
    ├── tenant-local auth / MCP / providers
    └── Principal B Context
        └── user-local credentials
```

The project intentionally separates three isolation levels:

1. **Ownership kernel** — durable `(tenantId, userId) -> session` authorization, fail closed.
2. **Cordis context isolation** — tenant/principal service resolution and plugin lifecycle.
3. **Deployment isolation** — process/filesystem/network/shell boundaries such as one tenant per container/Pod when stronger isolation is required.

DSH's own `@deepseek-ai/dsh-scope` remains the Agent/Preset registration-visibility plane. Tenant capability isolation uses Cordis service isolation instead of competing for the Agent scope parent chain.

## v0.1 is frozen

The published v0.1 tags remain unchanged and document the original kernel contract:

- minimal authenticated `TenantPrincipal`;
- claim-once immutable session ownership;
- fail-closed access decisions;
- replaceable `TenantSessionStore` provider seam.

No new feature work is planned on the v0.1 line. Those guarantees are retained inside v0.2 as defense in depth.

## v0.2 runtime

`ctx.tenantRuntime` creates real Cordis tenant/principal child lifecycles. Selected service names receive independent isolation labels, so providers mounted below Tenant A and Tenant B resolve independently without a second application-level `tenantId -> service` container.

The runtime is provider-neutral: auth, MCP, credential, storage, model, or other capability providers opt into tenancy by being mounted under the appropriate context and by avoiding deployment-global state that bypasses Cordis resolution.

Known upstream/provider gaps are documented rather than hidden. For example, in the reviewed current upstream the DSH MCP client reserves `serverName` against `ctx.root`, so equal server names across tenant-local instances are not yet automatically safe.

## Guiding principles

- **Control → enforce** — strict fail-closed invariants where this repository owns the boundary.
- **Ecosystem → standardize** — use Cordis/DSH native scope mechanisms and propose the smallest upstream seam when a provider is still global.
- **Outside control → bound** — Context is not a process sandbox; say so explicitly.
- **No second DI container** — tenant capability resolution belongs to Cordis Context.
- **Defense in depth** — Context routing never replaces persistent session ownership checks.

## Packages

| Package | Distribution | Role |
| --- | --- | --- |
| [`packages/multi-tenant`](./packages/multi-tenant) | npm `dsh-multi-tenant@next` | v0.2 runtime + frozen v0.1 ownership kernel: `ctx.tenantRuntime`, `ctx.multiTenant`, `ctx.tenantSessionStore`. |
| [`packages/multi-tenant-web`](./packages/multi-tenant-web) | private workspace | Experimental Web/API enforcement research; transport integration remains gated by real authenticated principal/context binding. |

See [ROADMAP.md](./ROADMAP.md), [`docs/releases/v0.2.0-rc.1.md`](./docs/releases/v0.2.0-rc.1.md), and [CONTRIBUTING.md](./CONTRIBUTING.md).

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Full release gate:

```sh
pnpm release:check
```

## License

MIT