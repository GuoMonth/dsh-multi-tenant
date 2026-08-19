[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Composable multi-tenant plugin primitives for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

> **Phase: first kernel prerelease.** The kernel baseline is established and
> test-pinned; its public contract remains prerelease. The current DSH target is
> **`0.1.0-rc.7`**. The release-oriented plan is in
> [ROADMAP.md](./ROADMAP.md), and exact evidence/version rules are in
> [`docs/reference/compatibility.md`](./docs/reference/compatibility.md).

## What this is

A **plugin family with a small kernel**, not a promise to implement an entire
SaaS platform. `dsh-multi-tenant` owns the tenant/session primitives this
repository can enforce directly: identity shape, immutable session ownership,
fail-closed authorization, and the `TenantSessionStore` provider contract.

Other capabilities are added only when their boundary is real and useful. A DSH
or third-party seam is handled through a minimal contract/conformance proposal;
a surface we cannot reliably enforce is documented as a boundary instead of
being absorbed into a local fork.

## Guiding principles

- **Control → enforce** — where this repository owns the enforcement point, the
  rule is strict and fail-closed, and the invariant is locked by executable
  tests.
- **Ecosystem → standardize** — where a guarantee depends on DSH or another
  replaceable ecosystem component, define the smallest useful seam/contract,
  publish conformance expectations, and collaborate upstream.
- **Outside control → bound** — where no reliable enforcement seam exists,
  state the threat-model / support boundary plainly. Complexity is not evidence.
- **Fast-follow prereleases** — pin explicit DSH prereleases, record the exact
  evidence version, and revalidate only seams affected by an upstream change.
- **One-way dependency** — the kernel has no transport/vendor dependency (no
  JWT, PostgreSQL, HTTP, MCP, Redis); providers and integrations stay outside.
- **Default ≠ only** — a provider is replaceable when it passes the same shared
  contract suite; roadmap symmetry is never a reason to implement every backend.

## Release scope

The first public 0.1 prerelease is the **kernel package**. Production Web
multi-user enforcement is a separate ecosystem-gated track:

- `dsh-multi-tenant` — release candidate: ownership, authorization, store seam,
  testing utilities.
- `dsh-multi-tenant-web` — experimental fail-closed enforcement spike; its
  production contract waits for a DSH request/connection principal-scope seam.

The 0.1 line does **not** claim shell/filesystem/process/container/network
isolation, billing/UI/organization management, host-global resource tenancy, or
cross-user team ACLs. See the boundary matrix in [ROADMAP.md](./ROADMAP.md).

## Packages

| Package | npm | Role |
| --- | --- | --- |
| [`packages/multi-tenant`](./packages/multi-tenant) | `dsh-multi-tenant` | Kernel: `ctx.multiTenant` + `ctx.tenantSessionStore`, claim-once ownership, fail-closed authorization, provider contract/testing. |
| [`packages/multi-tenant-web`](./packages/multi-tenant-web) | `dsh-multi-tenant-web` | Experimental tenant-bound `ApiProxy` enforcement research; production principal binding is DSH-transport-gated. |

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development policy and
[`docs/specs/architecture.md`](./docs/specs/architecture.md) for layer ownership.

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
