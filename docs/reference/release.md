[简体中文](./release.zh-CN.md) | English

# Release contract

The project is in rapid prerelease development. Release mechanics are intentionally simple and deterministic.

## Current artifact

- **Package:** `dsh-multi-tenant`
- **Current version:** read from `packages/multi-tenant/package.json`
- **Current candidate:** `0.2.0-rc.3`
- **npm dist-tag:** `latest`
- **DSH baseline:** `0.1.1-rc.2` @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- **Publishing:** npm Trusted Publishing through GitHub Actions OIDC
- **Provenance:** enabled

The Runtime Contract is currently the only live workspace package and the only release artifact.

## Single source of truth

The package manifest owns release identity:

```text
packages/multi-tenant/package.json
  ├─ version
  └─ publishConfig.tag = latest
```

The release workflow does not ask the operator to retype a version. Manual dispatch from `main` reads the manifest, verifies the repository, runs the complete release proof and publishes exactly that version.

## One npm channel

During the current rapid-iteration phase, the project maintains a single npm channel:

> `latest` = the newest version the project has intentionally published.

Prerelease/stable meaning is expressed by SemVer itself (`0.2.0-rc.3`, later `0.2.0`, etc.), not by maintaining a second `next` channel.

Install the current release with:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

## Pre-publication proof

From a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

The proof includes package/architecture invariants, release preflight, TypeScript typecheck, unit/contract tests, build, packed external-consumer smoke and exact-version DSH compatibility probes.

CI separately checks out the exact upstream DSH release commit and verifies its source version.

## Publication flow

`.github/workflows/release.yml` is manually dispatched from `main` and:

1. reads `packages/multi-tenant/package.json.version` into one release identity;
2. validates npm Trusted Publishing capability;
3. performs frozen install and `pnpm release:check`;
4. checks npm repository ownership and whether the exact version already exists;
5. publishes with npm OIDC/provenance when needed;
6. verifies the exact registry artifact and that `latest` resolves to it;
7. creates the matching Git tag and GitHub release.

The workflow is idempotent for an already-published exact version: publication is skipped, while verification/tag/release recovery can continue.

## Registry proof

`scripts/registry-smoke.mjs` installs the exact published artifact into a clean consumer and exercises the current Runtime Contract, including:

- store + ownership kernel;
- `ctx.tenantRuntime`;
- canonical Tenant/Principal creation;
- tenant capability inheritance;
- durable session ownership from a Principal Context;
- provider store contract;
- npm `latest` pointing to the released version.

## Release philosophy

Release automation should protect correctness without creating process ceremony. Current development prefers frequent, explicit releases over maintaining multiple channels or compatibility promises that slow structural improvement.

Future v0.3 packages should enter the release graph only after their independent contract/lifecycle boundary exists. Do not create release machinery for speculative packages.
