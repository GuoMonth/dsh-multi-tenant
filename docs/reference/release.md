[简体中文](./release.zh-CN.md) | English

# Kernel prerelease contract

This document is the release contract for the first public kernel artifact. R2 fixed the artifact and its proof; R3 only publishes and verifies it.

## Artifact

- **Package:** `dsh-multi-tenant`
- **Version:** `0.1.0-rc.1`
- **npm dist-tag:** `next`
- **DSH compatibility target:** `0.1.0-rc.7`
- **Node:** `^22.19.0 || >=24.0.0`
- **Provenance:** enabled

`dsh-multi-tenant-web` is private and is **not** part of this release.

## Release guarantee

The artifact guarantees only the kernel-owned contract: opaque principal/owner identity shapes, claim-once immutable session ownership, unconditional cross-tenant denial, v0.1 same-user ownership, fail-closed unknown/foreign-session authorization, non-enumerating public denial, and the replaceable async `TenantSessionStore` contract plus shared provider test suite.

The bundled `InMemoryTenantSessionStore` is a reference/bootstrap provider, not production durability.

## Explicit release boundary

The prerelease does not claim authentication, production DSH Web multi-user isolation, durable storage, MCP credential/context isolation, audit persistence, team ACLs, or shell/filesystem/process/container/network isolation.

## Pre-publication proof

From a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

The release workflow reruns this full proof from `main` before touching npm.

## R3 publication workflow

Publication is implemented by `.github/workflows/release.yml` and is intentionally manual (`workflow_dispatch`). The operator must type the exact package version and dispatch from `main`. The job runs in the `npm-release` GitHub Environment and:

1. verifies the requested version and npm trusted-publishing capability;
2. runs the full `release:check` gate;
3. checks the npm package name/repository and whether the exact version already exists;
4. publishes only when the exact version is absent;
5. verifies `next`, repository metadata, integrity, and a clean external consumer from the registry;
6. creates the matching `v0.1.0-rc.1` Git tag and GitHub prerelease only after registry verification succeeds.

The workflow is safe to rerun: if the exact npm version already exists under this repository, the publish step is skipped and post-publish verification/tag/release can recover.

## First-publication bootstrap

npm trusted publishing is configured per existing package. Because `dsh-multi-tenant` has never been published before, `0.1.0-rc.1` needs a one-time bootstrap credential.

Recommended bootstrap:

1. create/configure the GitHub Environment `npm-release` (restrict it to `main`; add a required reviewer if desired);
2. create a short-lived npm granular token that is allowed to create/publish the package under the account's 2FA policy;
3. store it **only** as the `NPM_BOOTSTRAP_TOKEN` secret in the `npm-release` Environment;
4. run `Publish kernel prerelease` from `main` with version `0.1.0-rc.1`;
5. after the package exists, configure npm Trusted Publishing for:
   - GitHub owner: `GuoMonth`
   - repository: `dsh-multi-tenant`
   - workflow filename: `release.yml`
   - environment: `npm-release`
   - allowed action: `npm publish`;
6. delete `NPM_BOOTSTRAP_TOKEN` and, after trusted publishing is proven, restrict traditional token publishing on npm.

The workflow grants `id-token: write` and publishes with provenance. With trusted publishing configured, npm uses short-lived OIDC credentials; the bootstrap token is no longer needed.

## Post-publication verification

The workflow runs `scripts/registry-smoke.mjs` against the exact published version. A human can additionally verify DSH installation with:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

R3 is complete only when the npm version exists, `next` resolves to it, the registry smoke passes, and the matching GitHub prerelease/tag exist.
