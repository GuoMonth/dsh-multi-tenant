[简体中文](./CONTRIBUTING.zh-CN.md) | English

# Contributing

This repository optimizes for **current structural correctness and fast prerelease iteration**, not compatibility with old milestone shapes.

## Start from the live product model

```text
Product authentication
  -> trusted Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> typed Runtime capabilities
  -> one-shot Operation
  -> Principal-owned DSH Agent
  -> native DSH integrations
```

Before adding code, answer:

1. Who owns the identity/state/resource?
2. What lifecycle creates, publishes, cancels and tears it down?
3. Can Cordis/DSH already express the dependency or registration boundary?
4. What invalid state should be structurally impossible?
5. What executable evidence proves the behavior?
6. Does this still serve the current `0.3` product direction?

If a design needs many exceptions, revisit the data model instead of adding compatibility glue.

## Boundary rule

- **We control it -> enforce it.** Fail closed where appropriate and test it.
- **The ecosystem controls it -> prove/standardize the smallest seam.** Pin external baselines and keep executable compatibility evidence.
- **We cannot enforce it -> state the boundary.** Do not hide it behind a local fork or parallel registry.

## Current structural rules

- Product authentication stays outside Core; ingress starts from an already trusted subject.
- Tenant and Principal are canonical lifecycle identities; Principal is nested under Tenant.
- `CapabilityToken<T, Scope>` binds semantic key, type and authority/lifecycle scope.
- Cordis remains the DI/service/lifecycle substrate; do not build a second container.
- `RuntimeComposition` binds one exact product plan and prevents silent plan mixing.
- Operation is non-reactive one-shot semantic work and captures required capabilities once.
- A long-lived DSH Agent belongs to the Principal, not to the short create/resume Operation.
- Session ownership fails closed; unauthorized resume is rejected before DSH work.
- Agent Integration uses native DSH seams; do not create a second Agent/MCP registry.
- Strong hostile-code isolation belongs to process/container/Pod/sidecar/remote boundaries.

A deliberate prerelease redesign may change these rules only when executable evidence shows a better global structure.

## External compatibility

Current exact DSH baseline:

- version: `0.1.1-rc.2`
- release commit: `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

`scripts/dsh-target.mjs` is authoritative. A baseline refresh is explicit: update the pin, run current source/platform/artifact proofs, fix failures structurally, then update live docs.

See `docs/reference/compatibility.md`.

## Evidence policy

`docs/specs/v0.3-assumptions.json` tracks blocking external assumptions. A public contract must not rely on an unproven blocking assumption.

Use the smallest useful proof:

- unit/contract tests for repository-owned semantics;
- compatibility probes for external DSH/Cordis behavior;
- real integration probes for protocol/Agent seams;
- installed-artifact smoke for what npm users actually receive.

Source reading is useful for forming a hypothesis; it is not a release proof.

## Vision is not contract

`docs/vision/*` records long-term direction only. It does not pre-approve package names or public APIs.

The current authority vision prefers typed abilities over permanent raw-credential exposure. A public Broker contract must be earned by repeated semantics across real integrations, not by architectural imagination.

## Package rule

Create a package only when there is a real independent consumer/replacement/lifecycle/versioning boundary.

Do not scaffold speculative Auth, Broker, ERP, MCP or Transport package families. Research and one-off evidence belong in focused tests/scripts/docs or Git history.

## Definition of done

A change is done when:

- ownership/lifecycle/type implications are coherent;
- it serves the current product direction;
- current specs/docs are aligned;
- required external assumptions are executable and green;
- `pnpm release:check` is green;
- no obsolete compatibility shim, milestone scaffold or duplicate protocol/registry is added.

Historical prerelease documents and superseded investigations belong in Git history, not the live tree.
