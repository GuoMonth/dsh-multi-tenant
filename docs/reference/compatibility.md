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

Compatibility is proven from several independent directions. A baseline is accepted only when the evidence for the **current live architecture** passes; historical seams do not remain blocking merely because older versions once depended on them.

### Exact upstream source identity

GitHub Actions checks out the pinned upstream repository at the exact release commit and verifies:

- checkout HEAD equals `DSH_TARGET.commit`;
- upstream root `package.json.version` equals `DSH_TARGET.version`.

### DSH publication and owner-context behavior

`pnpm probe:dsh` installs exact published DSH packages into clean temporary consumers and proves:

- **Session genesis** — setup/publication visibility and rollback behavior;
- **caller-bound Agent owner context** — DSH Agent creation preserves trusted Tenant/Principal caller metadata and capability resolution.

This is upstream seam evidence, not the semantic definition of a user Operation.

### Cordis lifecycle behavior

`pnpm probe:cordis` proves the external lifecycle assumptions the Runtime uses:

- child Fiber ownership/cleanup follows parent lifetime;
- `ctx.inject()` is dependency-reactive and may rerun after provider loss/recovery.

The second fact is precisely why user-visible work uses a non-reactive Principal Operation rather than a raw inject callback.

### SaaS Core vertical compatibility

`pnpm probe:saas-core` exercises the complete active DSH-facing path against the pinned public AgentRegistry:

```text
Typed CompositionPlan
  -> Tenant / Principal
  -> Principal-owned one-shot Operation
  -> typed capability snapshot
  -> real DSH Agent create / resume / failure
```

The proof covers multiple Tenants/Principals, caller-bound identity/capability visibility, exact-once semantic execution, create/resume, downstream failure and quiescent cleanup.

This is the primary integration evidence for the current v0.3 Core.

### Packed artifact behavior

`pnpm smoke` builds and packs the npm artifact, installs it into a clean external consumer and executes the public Runtime/Composition/Operation contract, including typed capability snapshots and scope-local composition identity.

Source tests alone are not sufficient evidence for a release artifact.

## Historical evidence is not a permanent gate

Historical Web/ApiProxy, global admission-decorator and raw reactive-integration-fiber experiments remain in Git history rather than live blocking compatibility suites.

If a future architecture genuinely depends on one of those seams again, reintroduce a focused proof from current requirements instead of reviving the old surface by default.

## Manual baseline refresh

When intentionally moving DSH/Cordis forward:

1. select explicit versions and, for DSH, the release commit;
2. update `scripts/dsh-target.mjs` and active dependency pins;
3. regenerate `pnpm-lock.yaml` from the real registry when the workspace graph changes;
4. verify exact upstream source identity;
5. run `pnpm probe:platform` so DSH + Cordis + SaaS Core assumptions are exercised together;
6. run quality/packed-consumer gates;
7. fix failures structurally rather than weakening evidence;
8. update live docs to the new baseline and keep historical release notes unchanged.

## Compatibility philosophy

This project is in rapid prerelease development. We do not preserve early API shapes, test harnesses or investigation surfaces merely because they were once correct.

Compatibility work follows three rules:

- where this repository owns a boundary, enforce it;
- where DSH/Cordis/provider/integration ecosystems own a seam the live architecture depends on, prove or standardize it;
- when a seam no longer serves the product direction, remove it from the live tree instead of maintaining compatibility theater.

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
- DSH + Cordis + SaaS Core platform probes on Node 22.19 and Node 24.

## Runtime/core dependency invariant

The current publishable package keeps runtime dependencies minimal and uses Cordis/DSH native seams rather than embedding vendor implementations into the Core.

Product authentication protocols, durable secret stores, databases, HTTP/WebSocket servers and concrete vendor integrations belong outside the Core unless a future proven boundary explicitly requires otherwise.

MCP is treated according to the DSH-native integration seam available at the selected baseline; v0.3 does not add a parallel protocol stack merely for compatibility breadth.
