[简体中文](./release.zh-CN.md) | English

# Kernel prerelease contract

The kernel has a real published prerelease line. This reference defines the
current release artifact and the mechanical proof required before publication.

## Current artifact

- **Package:** `dsh-multi-tenant`
- **Candidate:** `0.1.0-rc.2`
- **npm dist-tag:** `next`
- **DSH compatibility target:** `0.1.0-rc.7`
- **Node:** `^22.19.0 || >=24.0.0`
- **Publishing:** npm Trusted Publishing / GitHub Actions OIDC
- **Provenance:** enabled

`dsh-multi-tenant-web` remains private and is not part of this release.

## Why rc.2 exists

`0.1.0-rc.1` successfully established the first public artifact, registry smoke,
provenance, tag, and GitHub prerelease. Before freezing a stable 0.1 contract,
rc.2 removes one speculative public field: `TenantPrincipal.roles`.

The ownership kernel never consumed roles. Keeping the required field would have
made every caller carry RBAC vocabulary that this package explicitly does not
own. The principal is therefore reduced to the identity the kernel actually
enforces:

```ts
interface TenantPrincipal {
  tenantId: string
  userId: string
}
```

Roles/permissions/admin policy belong to a separate policy plane if a real use
case later requires them.

## Release guarantee

The artifact guarantees only the kernel-owned contract: opaque tenant/user
identity, claim-once immutable session ownership, unconditional cross-tenant
denial, v0.1 same-user ownership, fail-closed unknown/foreign-session
authorization, non-enumerating public denial, and the replaceable async
`TenantSessionStore` contract plus shared provider test suite.

The bundled `InMemoryTenantSessionStore` is a reference/bootstrap provider, not
production durability.

## Explicit boundary

The prerelease does not claim authentication, production DSH Web multi-user
isolation, durable storage, MCP credential/context isolation, audit persistence,
team ACLs, general RBAC, or shell/filesystem/process/container/network isolation.

## Pre-publication proof

From a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

The release workflow reruns this proof from `main` before touching npm.

## OIDC-only publication

Publication is implemented by `.github/workflows/release.yml` and is manual
(`workflow_dispatch`). The operator types the exact package version and dispatches
from `main`. The job runs in the `npm-release` GitHub Environment with
`id-token: write` and no npm publish token fallback.

The workflow:

1. validates branch/version and npm trusted-publishing capability;
2. runs `release:check`;
3. checks npm package ownership and exact-version state;
4. publishes through npm Trusted Publishing/OIDC only when the version is absent;
5. verifies `next`, repository metadata, integrity, and a clean external consumer;
6. creates the matching Git tag and GitHub prerelease only after registry smoke succeeds.

It is safe to rerun: an existing matching npm version skips duplicate publish and
continues verification/tag/release recovery.

The first-publication bootstrap token used for rc.1 is no longer part of the
workflow. Maintainers should remove/revoke any remaining bootstrap credential.

## Post-publication verification

The workflow runs `scripts/registry-smoke.mjs` against the exact version. A human
can additionally verify DSH installation with:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

After rc.2, the project should prefer observation and real feedback over adding
more speculative kernel API. Barring a real bug or upstream compatibility change,
the next release decision is whether the contract is ready for `0.1.0` stable.
