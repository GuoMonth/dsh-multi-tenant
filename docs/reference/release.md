[简体中文](./release.zh-CN.md) | English

# Release contract

The project is in rapid prerelease development. Release mechanics are intentionally simple, evidence-driven and deterministic.

## Current release identity

- **Package:** `dsh-multi-tenant`
- **Candidate:** `0.3.0-rc.1`
- **Release identity source:** `packages/multi-tenant/package.json`
- **npm dist-tag:** `latest`
- **DSH baseline:** `0.1.1-rc.2` @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- **Publishing:** npm Trusted Publishing through GitHub Actions OIDC
- **Provenance:** enabled

`dsh-multi-tenant` remains the only publishable workspace package and the only release artifact. Registry state is not duplicated in documentation: the publication workflow reads npm immediately before and after publication.

## What 0.3.0-rc.1 means

This is the first v0.3 candidate whose release gate covers the product-facing path, not only the low-level Runtime:

```text
trusted product subject
  -> Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> official DSH MCP client
  -> native Agent-scoped MCP Tools
```

The release note is `docs/releases/v0.3.0-rc.1.md`.

## Single source of truth

```text
packages/multi-tenant/package.json
  ├─ version
  └─ publishConfig.tag = latest
```

The operator never retypes a version. Manual dispatch from `main` reads the manifest and publishes exactly that identity.

## One npm channel

During rapid prerelease development the project intentionally keeps one channel:

> `latest` = the newest version the project deliberately published and then verified.

Prerelease/stable meaning comes from SemVer, not a second `next` channel.

Install through DSH:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

The M5 integration dynamically composes the official `@deepseek-ai/dsh-mcp-client` supplied by the compatible DSH installation; it does not vendor or fork MCP protocol code.

## Pre-publication proof

From a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

The release proof includes:

- package / architecture / v0.3 contract invariants;
- release-manifest and documentation preflight;
- TypeScript typecheck and unit/contract tests;
- build + tarball export inspection;
- clean installed-artifact consumer smoke beside the pinned DSH CLI;
- exact DSH source identity;
- Cordis lifecycle assumptions;
- real DSH Agent owner-context proof;
- real stdio MCP server, official MCP-client discovery and real `ToolRuntime.execute()` evidence;
- Node 22.19 and Node 24 coverage.

The clean installed-artifact smoke is deliberately separate from source tests: it proves the packed package can resolve the compatible official MCP client and exercise Product Ingress, RuntimeComposition, Credentials, Tenant MCP configuration and Session authorization from the installation layout a user receives.

## Publication flow

`.github/workflows/release.yml` is manually dispatched from `main` and:

1. reads the exact version from the manifest;
2. validates npm Trusted Publishing capability;
3. performs frozen install and the full `pnpm release:check`;
4. verifies npm package/repository identity and exact-version state;
5. publishes with OIDC/provenance when the exact version is absent;
6. installs and exercises the exact registry artifact through the same v0.3 installed-consumer contract;
7. asserts npm `latest` resolves to that exact version;
8. creates the matching Git tag and prerelease GitHub Release using `docs/releases/v<version>.md`.

The flow is recovery-safe: if the exact version already exists, it skips duplicate publication but still verifies the registry artifact and can recover tag/release creation.

## Registry proof

`scripts/registry-smoke.mjs` first verifies npm version, repository, integrity and `latest`, then delegates to `scripts/artifact-consumer-smoke.mjs` using the exact registry spec. Pre- and post-publication consumer semantics therefore stay aligned instead of maintaining separate v0.2/v0.3 smoke stories.

## Workflow policy

Only two permanent GitHub Actions workflows are intended after release convergence:

- `ci.yml` — normal source, package and platform evidence;
- `release.yml` — explicit mainline publication and registry verification.

One-shot investigation/audit workflows may be used while preparing a release, but must be removed once their conclusion is encoded in permanent tests or release gates.

## Release philosophy

Release automation protects correctness, not ceremony. `0.3.0-rc.1` is still a prerelease: breaking improvements remain acceptable when real usage disproves a contract, especially around the longer-term `Capability-as-Authority` / Broker direction.
