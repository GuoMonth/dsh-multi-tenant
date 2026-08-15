# dsh-multi-tenant

Composable multi-tenant / SaaS plugin suite for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

> **Phase: engineering foundation.** The kernel contract is stable; the suite
> grows around it one plugin at a time. See [ROADMAP.md](./ROADMAP.md).

## What this is

A **plugin family**, not a single plugin. A kernel — `dsh-multi-tenant` — owns
the tenant/session contract (identity, ownership, fail-closed authorization).
This repository ships the official default implementations (storage, web
enforcement, …) as independently publishable [Cordis](https://github.com/cordiverse/cordis)
plugins, each following DSH's service/bundle logic and each replaceable by a
third-party implementation that passes the same contract tests.

Maintaining a complete default stack matters because a single party can then
hold the **end-to-end tenant-isolation invariant** — tenant A can never touch
tenant B across auth → RPC → session → MCP → downstream — something no single
plugin's unit test can prove.

## Guiding principles

- **Three layers, native vocabulary** — *Contract* (abstract `Service`) →
  *Provider* (plugin) → *Composition* (`cordis.patch.yml` bundle). No
  abstractions beyond what DSH already has.
- **One-way dependency** — everything depends on the kernel's contracts; the
  kernel depends on nothing transport- or vendor-specific (no JWT, no
  PostgreSQL, no HTTP, no MCP, no Redis).
- **Split by replaceable capability, not size** — and a single security
  invariant is not split across packages.
- **Default ≠ only** — the suite ships defaults; third parties may swap any
  layer, if it passes the same contract test.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how development is done here.

## Packages

| Package | npm | Role |
| --- | --- | --- |
| [`packages/multi-tenant`](./packages/multi-tenant) | `dsh-multi-tenant` | Kernel: `ctx.multiTenant` + `ctx.tenantSessionStore`, claim-once ownership, fail-closed authorization. |
| [`packages/multi-tenant-web`](./packages/multi-tenant-web) | `dsh-multi-tenant-web` | Web enforcement: principal binding, RPC/mux/WS guard (early spike). |

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Root scripts delegate to every workspace package via `pnpm -r`.

## License

MIT
