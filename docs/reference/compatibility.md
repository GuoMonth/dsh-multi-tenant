[简体中文](./compatibility.zh-CN.md) | English

# Compatibility & evidence

`0.3` supports an explicit platform baseline. The project does not follow floating DSH/npm latest in blocking CI.

## Supported baseline

- **Node:** `^22.19.0 || >=24.0.0`
- **Cordis:** `@deepseek-ai/cordis >=4.0.1 <5`
- **DSH:** `0.1.1-rc.2`
- **DSH release commit:** `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

`scripts/dsh-target.mjs` owns the DSH version/commit identity.

## What CI proves

### Exact upstream identity

CI checks out the exact DSH release commit and verifies the source version before compatibility jobs are accepted.

### DSH lifecycle seams still used by 0.3

`pnpm probe:dsh` proves two current external assumptions:

- Agent setup/publication ordering prevents setup failure from exposing a half-configured Agent;
- DSH Agent creation preserves the caller-bound Principal-derived owner context.

These probes remain because the `0.3` product path still depends on those upstream behaviors, not because they belong to an older release line.

### Cordis lifecycle seam

`pnpm probe:cordis` proves parent/child Fiber teardown and the reactive nature of `ctx.inject()`. The latter is why user semantic work uses the non-reactive Principal Operation boundary.

### Real MCP Agent integration

`pnpm probe:mcp` is the main upstream vertical proof. It installs the pinned public DSH packages and uses a real stdio MCP server to verify:

- official MCP-client `serverName` behavior;
- real `tools/list` discovery;
- real DSH `ToolRuntime.execute()` -> MCP `tools/call`;
- Agent-scoped Tool visibility;
- concurrent Tenant/Principal config and credential isolation;
- cross-Principal resume denial before the DSH Agent seam;
- startup-failure and teardown behavior.

### Installed artifact

`pnpm smoke` builds/packs `dsh-multi-tenant`, verifies required tarball/export targets, installs the packed artifact beside `@deepseek-ai/dsh@0.1.1-rc.2` in a clean consumer, and exercises the current Product Ingress / RuntimeComposition / Credentials / MCP contract.

The post-publication registry smoke reuses that same installed-consumer proof against the exact npm version.

## Compatibility philosophy

This project is in rapid prerelease development:

- current external seams are proven because the live product depends on them;
- old milestone names, historical release notes and superseded probes are removed from the active tree;
- breaking changes are allowed when real integration evidence proves a better contract;
- Git history/tags preserve archaeology; the live repository optimizes for current correctness and speed.

## Moving the baseline

When intentionally moving DSH/Cordis forward:

1. choose explicit versions and a DSH release commit;
2. update `scripts/dsh-target.mjs` and active dependency pins;
3. regenerate the lockfile when needed;
4. run source identity, platform probes and installed-artifact smoke;
5. fix failures structurally rather than weakening the evidence;
6. update live docs to the new baseline.
