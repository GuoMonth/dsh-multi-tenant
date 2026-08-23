[简体中文](./compatibility.zh-CN.md) | English

# Compatibility & versioning policy

## Runtime baseline

- **Node:** `^22.19.0 || >=24.0.0`
- **Cordis peer:** `@deepseek-ai/cordis >=4.0.1 <5`
- **DSH:** explicit baseline only; never a floating dependency

CI exercises Node `22.19.0` and Node `24`.

## Current DSH baseline

`scripts/dsh-target.mjs` is the single source of truth:

```js
DSH_TARGET = {
  repository: 'deepseek-ai/deepseek-harness',
  version: '0.1.1-rc.2',
  commit: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
}
```

Future upgrades are manual and explicit; blocking CI does not auto-follow npm `latest` or upstream `master`.

## Evidence model

Compatibility is proven from two independent directions.

### Exact upstream source identity

GitHub Actions checks out the pinned upstream repository at the exact release commit and verifies:

- checkout HEAD equals `DSH_TARGET.commit`;
- upstream root `package.json.version` equals `DSH_TARGET.version`.

### Exact published-package behavior

`pnpm probe:dsh` installs exact published DSH packages into clean temporary consumers and executes only the seams the current architecture depends on:

- **session genesis proof** — publication visibility and rollback semantics;
- **Agent owner/composition proof** — a Principal-derived integration fiber reaches DSH Agent creation as caller-bound `ownerCtx` while preserving tenant/principal identity and capability resolution.

Historical Web/ApiProxy and global admission-decorator experiments are intentionally not blocking compatibility evidence. They remain available in Git history and can be re-investigated if a future v0.3 design actually depends on those seams.

## Manual baseline refresh

When we intentionally move DSH forward:

1. select the explicit DSH version and release commit;
2. update `scripts/dsh-target.mjs`;
3. update any currently active DSH-facing pins that exist at that time;
4. regenerate `pnpm-lock.yaml` from the real npm registry when the workspace graph changes;
5. rerun source-identity verification and the executable compatibility probes;
6. fix contract failures structurally rather than weakening evidence;
7. update current docs to describe the selected baseline.

Historical release notes keep the versions they actually proved.

## Compatibility philosophy

This project is in rapid prerelease development. We do not preserve early API shapes or old investigation surfaces merely because they are technically correct.

Compatibility work follows three rules:

- where this repository owns a boundary, enforce it;
- where DSH/provider ecosystems own a seam that the current architecture actually depends on, prove or standardize it;
- when an old seam no longer serves the product direction, remove it from the live tree instead of maintaining compatibility theater.

## CI gates

Pull requests and `main` require:

- exact upstream DSH source baseline verification;
- frozen-lockfile installation;
- package/architecture invariants (`pnpm verify`);
- release manifest preflight;
- TypeScript typecheck;
- unit and contract tests;
- build;
- packed external-consumer smoke;
- exact-version DSH runtime probes on Node 22.19 and Node 24.

## Runtime invariant

The public runtime package depends on Cordis only. Transport/vendor implementations such as JWT, databases, HTTP, MCP or Redis do not belong in the core Runtime Contract. Provider families and SaaS composition are layered above it only when those package boundaries become real.
