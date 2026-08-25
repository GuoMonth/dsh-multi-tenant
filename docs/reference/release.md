[简体中文](./release.zh-CN.md) | English

# Release contract

`0.3` is the live release line. Release automation is intentionally small: prove the artifact, publish one package, verify the exact registry result.

## Current release identity

- **Package:** `dsh-multi-tenant`
- **Candidate:** `0.3.0-rc.3`
- **Theme:** Durable Local Experience
- **Identity source:** `packages/multi-tenant/package.json`
- **npm dist-tag:** `latest`
- **DSH baseline:** `0.1.1-rc.2` @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- **Publishing:** GitHub Actions OIDC + npm Trusted Publishing
- **Provenance:** enabled

There is one publishable workspace package and one publication workflow.

## What this release proves

The release gate covers the product-facing path plus durable local ownership:

```text
existing product authentication
  -> TrustedSubject
  -> Product Ingress / Web bridge
  -> RuntimeComposition
  -> Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> Principal-aware create/resume
  -> immutable SQLite Session ownership
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native Agent-scoped MCP Tools
```

A normal DSH bundle install now uses `SQLiteTenantSessionStore`, backed only by Node's built-in `node:sqlite`, so Session ownership survives local process restart without PostgreSQL/Docker/native addons.

The current release note is `docs/releases/v0.3.0-rc.3.md`.

## Pre-publication proof

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

The proof includes current architecture invariants, release/document preflight, typecheck/tests/build, exact DSH/Cordis compatibility probes, real MCP wire execution, the packed npm artifact installed beside the pinned DSH CLI in a clean consumer, the real-Web First Product Experience proof, and the separate-process SQLite durability proof.

`pnpm probe:fpe` packs the candidate, installs it into a clean pinned DSH Web profile, boots real `dsh web`, then proves canonical identity, real MCP Tool execution, owner resume, denied cross-Principal resume, second-Tenant isolation and non-disclosure of the raw starter credential.

`pnpm probe:sqlite` starts independent Node processes against one SQLite file and proves restart persistence, same-owner idempotency, sibling-Principal/cross-Tenant conflict, and exactly one winner under competing multi-process claims.

`pnpm smoke` verifies tarball contents, every public export target, and explicit installed imports of the product/Web/diagnostics/starter/SQLite-store surfaces.

## Acknowledged Web boundary

Issue #41 remains an explicit upstream boundary rather than a release blocker. Pinned DSH does not carry a product-authenticated Principal through every stock Web RPC business dispatch.

The production deployment contract therefore keeps DSH Web private behind a Product Gateway/BFF that authenticates, resolves the canonical Tenant/Principal and authorizes protected Session/Agent resources before forwarding. Public clients must not have a bypass route to stock DSH `/api`.

SQLite is similarly scoped: it is the zero-external-service local durable provider, not a claim of horizontally scaled production persistence.

## Publication flow

`.github/workflows/release.yml` is manually dispatched from `main` and:

1. reads the exact version from the package manifest;
2. runs the full `pnpm release:check`, including real-Web FPE and SQLite durability proofs;
3. verifies npm repository ownership and exact-version state;
4. publishes with OIDC/provenance when the version is absent;
5. verifies npm version, repository, integrity and `latest`;
6. installs and exercises the exact registry artifact using the same v0.3 consumer smoke;
7. creates the matching Git tag and prerelease GitHub Release.

If the exact version already exists, publication is skipped while verification/tag/release recovery can continue.

## Permanent GitHub Actions

Only two workflows belong in the live tree:

- `ci.yml` — current source/package/platform/FPE/SQLite durability evidence;
- `release.yml` — explicit publication and post-publication verification.

One-shot investigation workflows must be deleted once their conclusion has been encoded in permanent tests or gates.

## Release philosophy

Git history/tags preserve old prerelease archaeology. The live repository keeps the current release note and current release machinery, not old scope documents or obsolete milestone artifacts.

`0.3.0-rc.3` remains a prerelease: real product evidence may justify deliberate breaking changes, especially around credential lifecycle, production Gateway/BFF evidence, multi-instance persistence and the longer-term `Capability-as-Authority` direction.