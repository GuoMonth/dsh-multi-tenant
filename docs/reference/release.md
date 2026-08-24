[简体中文](./release.zh-CN.md) | English

# Release contract

`0.3` is the live release line. Release automation is intentionally small: prove the artifact, publish one package, verify the exact registry result.

## Current release identity

- **Package:** `dsh-multi-tenant`
- **Candidate:** `0.3.0-rc.1`
- **Identity source:** `packages/multi-tenant/package.json`
- **npm dist-tag:** `latest`
- **DSH baseline:** `0.1.1-rc.2` @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- **Publishing:** GitHub Actions OIDC + npm Trusted Publishing
- **Provenance:** enabled

There is one publishable workspace package and one publication workflow.

## What this release proves

The release gate covers the product-facing path:

```text
trusted product subject
  -> Product Ingress
  -> RuntimeComposition
  -> Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> safe create/resume
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native Agent-scoped MCP Tools
```

The current release note is `docs/releases/v0.3.0-rc.1.md`.

## Pre-publication proof

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

The proof includes current architecture invariants, release/document preflight, typecheck/tests/build, exact DSH/Cordis compatibility probes, real MCP wire execution, and the packed npm artifact installed beside the pinned DSH CLI in a clean consumer.

`pnpm smoke` also verifies tarball contents and every public export target, so there is no separate legacy package-smoke pipeline.

## Publication flow

`.github/workflows/release.yml` is manually dispatched from `main` and:

1. reads the exact version from the package manifest;
2. runs the full release proof again;
3. verifies npm repository ownership and exact-version state;
4. publishes with OIDC/provenance when the version is absent;
5. verifies npm version, repository, integrity and `latest`;
6. installs and exercises the exact registry artifact using the same v0.3 consumer smoke;
7. creates the matching Git tag and prerelease GitHub Release.

If the exact version already exists, publication is skipped while verification/tag/release recovery can continue.

## Permanent GitHub Actions

Only two workflows belong in the live tree:

- `ci.yml` — current source/package/platform evidence;
- `release.yml` — explicit publication and post-publication verification.

One-shot investigation workflows must be deleted once their conclusion has been encoded in permanent tests or gates.

## Release philosophy

Git history/tags preserve old prerelease archaeology. The live repository does not keep `0.1`/`0.2` release pipelines, old release notes, or milestone-specific verification simply for historical completeness.

`0.3.0-rc.1` remains a prerelease: real product evidence may justify deliberate breaking changes.
