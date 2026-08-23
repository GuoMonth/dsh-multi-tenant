[简体中文](./compatibility.zh-CN.md) | English

# Compatibility & versioning policy

## Runtime baseline

- **Node:** `^22.19.0 || >=24.0.0`
- **Cordis peer:** `@deepseek-ai/cordis >=4.0.1 <5`
- **DSH:** explicit baseline only; never a floating dependency

CI exercises Node `22.19.0` and Node `24.x`.

## Current DSH baseline

`scripts/dsh-target.mjs` is the single source of truth:

```js
DSH_TARGET = {
  repository: 'deepseek-ai/deepseek-harness',
  version: '0.1.1-rc.2',
  commit: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
}
```

This was the current DeepSeek Harness release when the v0.2 convergence baseline was selected. Future upgrades are manual and explicit; blocking CI does not auto-follow npm `latest` or upstream `master`.

## Evidence model

Compatibility is proven from two independent directions.

### Exact upstream source identity

GitHub Actions checks out the pinned upstream repository at the exact release commit and verifies:

- checkout HEAD equals `DSH_TARGET.commit`;
- upstream root `package.json.version` equals `DSH_TARGET.version`.

This establishes which source tree our architectural conclusions refer to.

### Exact published-package behavior

`pnpm probe:dsh` installs the exact published DSH npm versions into clean temporary consumers and executes:

- **session genesis proof** — publication visibility and rollback semantics;
- **admission/publication proof** — create/fork/subagent/resume setup before session entry;
- **Agent owner/composition proof** — a Principal-derived integration fiber reaches DSH Agent creation as caller-bound `ownerCtx` while preserving tenant/principal identity and capability resolution.

The Web proof package also pins `@deepseek-ai/dsh-host-apiproxy` to the same target version, enforced by `pnpm verify`.

## Manual baseline refresh

When we intentionally move DSH forward:

1. select the explicit DSH version and release commit;
2. update `scripts/dsh-target.mjs`;
3. update DSH-facing package pins to the same version;
4. regenerate `pnpm-lock.yaml` from the real npm registry;
5. rerun source-identity verification and all executable compatibility probes;
6. fix contract failures structurally rather than weakening evidence;
7. update current docs to describe the selected baseline.

Historical release notes keep the versions they actually proved.

## Compatibility philosophy

This project is in rapid prerelease development. We do not preserve early API shapes when they conflict with a better ownership model, stronger semantic types or clearer lifecycle/state transitions.

Compatibility work follows three rules:

- where this repository owns a boundary, enforce it;
- where DSH/provider ecosystems own the seam, define or consume a reusable contract;
- where neither provides a reliable boundary, document the limitation instead of hiding it behind a local fork or parallel registry.

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

## Kernel invariant

The public runtime package depends on Cordis only. Transport/vendor implementations such as JWT, databases, HTTP, MCP or Redis do not belong in the core Runtime Contract. Provider families and SaaS composition are layered above it.
