[简体中文](./release.zh-CN.md) | English

# Kernel prerelease contract

This document is the release contract for the first public kernel artifact. It
keeps R3 mechanical: R2 decides what may be published and what must be proven;
R3 performs the publication.

## Artifact

- **Package:** `dsh-multi-tenant`
- **Version:** `0.1.0-rc.1`
- **npm dist-tag:** `next`
- **DSH compatibility target:** `0.1.0-rc.7`
- **Node:** `^22.19.0 || >=24.0.0`

`dsh-multi-tenant-web` is a private workspace package and is **not** part of this
release.

The kernel package sets `publishConfig.tag = next`, so an ordinary publish does
not move the npm `latest` tag to a prerelease. The Web workspace sets
`private: true`, so npm-compatible publishing tools must refuse to publish it.

## Release guarantee

The artifact guarantees only the kernel-owned contract:

- opaque `TenantPrincipal` / `SessionOwner` identity shapes;
- claim-once, immutable session ownership;
- unconditional cross-tenant denial;
- v0.1 same-user ownership (same tenant, different user is denied);
- fail-closed unknown/foreign-session authorization;
- non-enumerating public denial;
- replaceable async `TenantSessionStore` contract and shared provider test suite.

The bundled `InMemoryTenantSessionStore` is a reference/bootstrap provider, not
production durability.

## Explicit release boundary

The prerelease does not claim authentication, production DSH Web multi-user
isolation, durable storage, MCP credential/context isolation, audit persistence,
team ACLs, or shell/filesystem/process/container/network isolation. These are
either ecosystem/later-provider work or explicit non-goals in the roadmap.

## One-command preflight

From a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` runs:

1. package/architecture verification and DSH pin-drift checks;
2. release-manifest preflight (one publishable workspace, exact version/tag,
   bundle/exports/files metadata, Web package private);
3. typecheck and unit/contract tests;
4. build;
5. packed external-consumer smoke (real tarball, clean consumer install/import);
6. RC7 session-genesis and Agent admission runtime proofs.

GitHub CI runs the quality and DSH-compatibility gates on both Node 22.19.0 and
Node 24.

## R3 publication checklist

R3 should remain a publication-only change/process:

1. merge R2 with all CI lanes green;
2. publish from the exact `main` commit that passed the gates;
3. publish **only** `dsh-multi-tenant@0.1.0-rc.1`;
4. keep the prerelease on `next`, not `latest`;
5. create the matching Git tag / GitHub release;
6. release notes name the DSH RC7 evidence baseline and repeat the explicit
   security boundary;
7. verify the registry artifact by installing it through DSH:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

Publication authentication/provenance mechanics belong to R3; they should not
change the package contract established here.
