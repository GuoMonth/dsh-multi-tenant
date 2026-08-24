[简体中文](./CONTRIBUTING.zh-CN.md) | English

# Contributing

`dsh-multi-tenant` is a fast-moving prerelease project. Contributions should optimize for **current product correctness, executable evidence and a small live tree** rather than preserving historical shape.

## Product and architecture rule

The current product path is:

```text
trusted product subject
  -> Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native MCP Tools
```

Before adding a new abstraction, package or compatibility layer, ask whether a real vertical slice needs it.

> **Do not create architecture because a name sounds reusable. Let repeated real integrations earn the abstraction.**

The project follows this boundary rule:

> **Enforce strictly where we control the boundary; define standards where ecosystem cooperation is required; state the boundary explicitly where we cannot control it.**

## Evidence before abstraction

A blocking external assumption must have executable evidence before public API depends on it.

Prefer this sequence:

```text
product requirement
  -> explicit boundary / assumption
  -> executable probe or contract test
  -> public API
  -> documentation
```

Source reading explains upstream behavior but does not replace a probe when the behavior is release-critical.

Current external assumptions are tracked in `docs/specs/v0.3-assumptions.json`.

## Cordis / DSH first

Prefer native DSH and Cordis seams:

- Context / Fiber for ownership and lifecycle;
- Cordis services for capabilities;
- DSH Agent scope for Agent-local behavior;
- official DSH MCP client / ToolRuntime for MCP Tools.

Do not introduce a second DI container, parallel lifecycle system or custom MCP protocol stack merely to make an abstraction look cleaner.

## Live tree policy

The active repository is **not an archive**.

Keep:

- current code;
- current product/runtime contracts;
- current executable evidence;
- current release machinery;
- non-binding long-term Vision that still affects architectural judgment.

Delete or consolidate:

- superseded milestone documents/names;
- old prerelease release notes after the project has moved to a new active baseline;
- one-shot investigation workflows after their conclusion is captured by permanent tests;
- redundant probes that are covered by a stronger current end-to-end proof;
- compatibility scaffolding that no current release contract needs.

Git history and tags preserve archaeology. Do not charge the current tree a permanent maintenance cost for it.

## Vision is not contract

Long-term direction may live under `docs/vision/*`, but Vision does not create a release gate or pre-approve package names/public APIs.

The current authority-capability Vision prefers eventually giving Operations typed abilities instead of raw credentials. A future Broker may be a replaceable plugin capability and service integrations may expose typed clients/transports. That remains Vision until multiple real integrations prove the common contract.

## Change checklist

Before merging a material change:

- the product value is clear;
- ownership/lifecycle boundaries are explicit;
- affected public contracts and docs are updated;
- release-critical external assumptions have executable evidence;
- Node 22.19 and Node 24 gates remain green where relevant;
- the packed artifact, not only workspace source, is exercised for package-facing changes;
- temporary investigation infrastructure has been removed or promoted into a permanent current proof;
- no retired milestone artifact is accidentally reintroduced.

## Release changes

`packages/multi-tenant/package.json` is the release identity source of truth. The retained release workflow publishes from `main` through npm Trusted Publishing/OIDC and then verifies the exact registry artifact.

Do not create release machinery for speculative future packages. Add it only when a real independently releasable boundary exists.
