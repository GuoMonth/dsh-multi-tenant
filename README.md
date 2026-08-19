[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Composable multi-tenant plugin primitives for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

> **Phase: kernel prerelease line.** `0.1.0-rc.1` is publicly published; the
> current convergence candidate is **`0.1.0-rc.2`**. The DSH target remains
> **`0.1.0-rc.7`**. See [ROADMAP.md](./ROADMAP.md) and
> [`docs/reference/release.md`](./docs/reference/release.md).

## What this is

A **plugin family with a small kernel**, not a promise to implement an entire
SaaS platform. `dsh-multi-tenant` owns only the tenant/session primitives this
repository can enforce directly: minimal tenant/user identity, immutable session
ownership, fail-closed authorization, and the `TenantSessionStore` provider
contract.

Other capabilities enter the project only when their boundary is real and useful.
A DSH/third-party dependency is handled through a minimal contract/conformance
proposal; a surface we cannot reliably enforce is documented as a boundary
instead of being absorbed into a local fork.

## Guiding principles

- **Control → enforce** — strict fail-closed rules with executable invariants.
- **Ecosystem → standardize** — define the smallest useful seam/contract and collaborate upstream.
- **Outside control → bound** — state the threat-model/support boundary plainly. Complexity is not evidence.
- **Fast-follow prereleases** — pin explicit DSH prereleases and revalidate only affected seams.
- **One-way dependency** — no JWT/PostgreSQL/HTTP/MCP/Redis dependency in the kernel.
- **Default ≠ only** — replaceable providers prove conformance with the shared contract suite.

## Release scope

- `dsh-multi-tenant` — published kernel: ownership, authorization, store seam, testing utilities.
- `dsh-multi-tenant-web` — private experimental enforcement spike; production principal binding waits for a DSH request/connection-scope seam.

The 0.1 line does **not** claim shell/filesystem/process/container/network
isolation, billing/UI/organization management, host-global resource tenancy,
general RBAC, or cross-user team ACLs. Roles/permissions are deliberately not
part of the kernel `TenantPrincipal`.

## Packages

| Package | Distribution | Role |
| --- | --- | --- |
| [`packages/multi-tenant`](./packages/multi-tenant) | npm `dsh-multi-tenant@next` | Kernel: `ctx.multiTenant` + `ctx.tenantSessionStore`, claim-once ownership, fail-closed authorization, provider contract/testing. |
| [`packages/multi-tenant-web`](./packages/multi-tenant-web) | private workspace | Experimental tenant-bound `ApiProxy` research; production principal binding is DSH-transport-gated. |

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development policy and
[`docs/specs/architecture.md`](./docs/specs/architecture.md) for layer ownership.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT
