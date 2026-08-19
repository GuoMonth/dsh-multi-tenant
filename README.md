[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Composable multi-tenant / SaaS plugin suite for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

> **Phase: engineering foundation.** The kernel baseline is established and
> test-pinned; its public contract remains prerelease. The suite grows around it
> one plugin at a time. The current DSH target is **`0.1.0-rc.7`**; exact
> evidence and prerelease pinning rules live in
> [`docs/reference/compatibility.md`](./docs/reference/compatibility.md). See
> [ROADMAP.md](./ROADMAP.md) for sequencing.

## What this is

A **plugin family**, not a single plugin. A kernel — `dsh-multi-tenant` — owns
the tenant/session contract (identity, ownership, fail-closed authorization).
This repository ships official default implementations (storage, web
enforcement, …) as independently publishable [Cordis](https://github.com/cordiverse/cordis)
plugins, each following DSH's service/bundle logic and each replaceable by a
third-party implementation that passes the same contract tests.

Maintaining a coherent default stack matters because it lets this repository
own and prove the tenant-isolation invariants on the surfaces it actually
controls. That promise stops at explicit boundaries: ecosystem-owned seams are
handled through contracts, conformance tests, and minimal upstream proposals;
surfaces this project cannot reliably enforce are documented as boundaries
instead of being hidden behind brittle local complexity.

## Guiding principles

- **Control → enforce** — where this repository owns the enforcement point, the
  rule is strict and fail-closed, and the invariant is locked by executable
  tests.
- **Ecosystem → standardize** — where a guarantee depends on DSH or another
  replaceable ecosystem component, define the smallest useful seam/contract,
  publish conformance expectations, and collaborate upstream. Do not fork or
  reimplement a whole subsystem merely to make the local project appear more
  complete.
- **Outside control → bound** — where no reliable enforcement seam exists,
  state the threat-model / support boundary plainly. Prefer an honest limitation
  over architectural complexity that cannot actually prove the guarantee.
- **Fast-follow prereleases** — pin explicit DSH prereleases, record the exact
  evidence version, and revalidate only the seams affected by an upstream
  change. Historical RC6 evidence stays labelled RC6; new work targets RC7
  until the compatibility baseline moves again.
- **Typical capability layering** — *Contract* (a native DSH/Cordis seam:
  Service, event, or protocol) → *Provider* (plugin) → *Composition*
  (`cordis.patch.yml` bundle), *where applicable*. Pure integration /
  security-boundary plugins compose directly against native seams.
- **One-way dependency** — the kernel owns only the minimal cross-suite tenant
  primitives and depends on nothing transport- or vendor-specific (no JWT, no
  PostgreSQL, no HTTP, no MCP, no Redis); capability packages own their own
  contracts and may depend on the kernel's primitives.
- **Split by replaceable capability, not size** — and a single security
  invariant is not split across packages.
- **Default ≠ only** — the suite ships defaults; third parties may swap any
  layer if it passes the same contract test.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how development is done here.
Full documentation lives in [`docs/`](./docs/README.md).

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
