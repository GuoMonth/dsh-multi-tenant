[简体中文](./CONTRIBUTING.zh-CN.md) | English

# Contributing

## Engineering model: global structure first

This repository optimizes for long-term structural correctness and rapid iteration, not prerelease compatibility.

Before changing code, model the system globally:

1. **Ownership/data structure** — what is the canonical tree/graph, and which invalid states should be impossible to represent?
2. **State transitions** — what are the explicit lifecycle states, publication boundaries, cancellation paths and teardown order?
3. **Semantic types** — which identity/capability/lifecycle meanings should TypeScript encode instead of leaving as loosely related fields?
4. **Native framework structure** — can Cordis/DSH already express the dependency, lifecycle or registration plane instead of adding another registry/facade?
5. **Executable contract** — what test or conformance harness proves the abstraction independently of one implementation?
6. **Relevance** — does this component still serve the current product direction, or is it merely technically correct historical work?

Only then implement the smallest coherent structure. Do not accumulate local patches around a weak model, and do not keep obsolete experiments alive just because they are correct.

## Boundary-first decision rule

Classify every guarantee:

1. **Controlled by this repository -> enforce it.** Own the reliable boundary, make it fail closed where appropriate, and prove it.
2. **Owned by the ecosystem -> standardize it.** Define or consume the smallest reusable DSH/provider seam and executable conformance contract.
3. **Not reliably enforceable -> bound it.** State the support/security boundary rather than hiding it behind a parallel registry or local fork.

## Runtime structural rules

The v0.2 runtime is a canonical ownership tree:

```text
Root -> Tenant -> Principal -> derived integration fibers -> DSH operations
```

Contributions must preserve these semantics:

- Tenant and Principal share canonical registry semantics;
- Principal identity is structurally nested under Tenant;
- asynchronous creation is unpublished until setup/commit succeeds;
- preparing creation is cancellable lifecycle state, not only a Promise;
- registry teardown closes admission, cancels preparing transactions, then drains published scopes;
- Principal Context is a capability root; operations derive fibers and explicitly inject dependencies;
- DSH Agent/Preset registration scope remains separate from Cordis Tenant/Principal service isolation;
- the v0.1 ownership kernel remains shared and is not replaced by Context metadata.

If a proposed feature requires repeated exceptions to these rules, revisit the abstraction before adding exceptions.

## Strong types and semantics

Prefer TypeScript types/generics that carry meaning:

- use distinct identity/state/definition types instead of generic dictionaries;
- normalize optional input into explicit internal data shapes;
- make parent-child structure encode invariants where possible;
- expose only lifecycle states consumers can actually observe;
- avoid APIs that force upper layers to know lower-layer creation recipes;
- keep one source of truth for package version, DSH baseline and other identities.

Compiler failures such as `exactOptionalPropertyTypes` violations are design feedback; fix the data shape rather than weakening compiler settings.

## DSH compatibility discipline

Current exact baseline:

- version: `0.1.1-rc.2`
- release commit: `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

`scripts/dsh-target.mjs` is authoritative. The baseline is manually advanced and never floats.

A DSH refresh must:

1. select an explicit version + release commit;
2. update every active DSH-facing pin consistently;
3. regenerate the lockfile from the real registry when the workspace graph changes;
4. verify the exact upstream source identity in GitHub Actions;
5. rerun the exact-version runtime probes the current architecture actually depends on;
6. fix failures structurally rather than weakening evidence;
7. update current docs while preserving historical release evidence.

See `docs/reference/compatibility.md`.

## Package conventions

**Do not create a package because a directory seems useful. Create it only when an independent boundary is real.**

A package must justify at least one of these independently meaningful properties:

- consumer-facing contract/API;
- replaceable provider capability;
- independent lifecycle/composition boundary;
- independent versioning/release boundary;
- product distribution boundary.

Research, compatibility exploration and one-off evidence should normally live in focused tests/scripts/docs or Git history, not as a long-lived workspace package. Promote research into a package only when the resulting boundary becomes part of the current architecture.

General rules:

- One package = one independently composable/replaceable capability, one integration boundary, or one indivisible security invariant.
- Prefer native DSH/Cordis Service, Context, Fiber, scope and typed protocol seams.
- Contract and default implementation may co-locate early; split only when replacement/lifecycle/versioning value is real.
- Do not scaffold speculative packages or names for future v0.3 capabilities.
- The SaaS Framework should be an opinionated Distribution assembled from a Plugin Family, not a monolithic implementation package.

## Dependency direction

```text
Runtime/kernel primitives <- capability contracts <- providers <- SaaS distribution
```

The runtime package keeps transport/vendor implementations out of core. Auth products, databases, HTTP/WebSocket transport, MCP product integration, audit/usage implementations and deployment profiles compose above the Runtime Contract only when their boundaries become concrete.

## Tests: contract vs conformance

- **Provider contract suites** prove a replaceable seam (for example `TenantSessionStore` or Runtime Capability Provider Contract).
- **Conformance/invariant suites** prove cross-component properties such as tenant isolation, publication ordering and lifecycle ownership.
- **Compatibility probes** prove assumptions about exact external DSH versions that the active architecture relies on.
- **Packed/registry smoke** proves the artifact users actually install, not only workspace source.

## Definition of done

- architecture/data/state/type implications reviewed globally;
- the change is demonstrably relevant to the current product direction;
- current docs/ADR/spec updated where behavior is decided;
- upstream/boundary ownership is explicit;
- exact DSH compatibility evidence is green when relevant;
- `pnpm release:check` is green;
- no transport/vendor implementation leaks into the runtime kernel;
- no speculative package/scaffold is introduced without a real boundary;
- no compatibility shim is added solely to preserve an obsolete prerelease abstraction.
