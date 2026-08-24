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
2. **Owned by the ecosystem -> standardize it.** Define or consume the smallest reusable DSH/provider/integration seam and executable conformance contract.
3. **Not reliably enforceable -> bound it.** State the support/security boundary rather than hiding it behind a parallel registry or local fork.

## Runtime structural rules

The live v0.3 topology is:

```text
Product authentication
  -> trusted identity resolution
  -> TenantPrincipal
  -> canonical Tenant
  -> canonical Principal
  -> typed Runtime capabilities
  -> Principal-owned one-shot Operation
  -> Agent Integration
  -> native DSH Agent/Preset/plugin composition
```

Contributions must preserve these semantics unless new executable evidence justifies a deliberate architectural revision:

- authentication protocol handling happens before the trusted Product Ingress boundary;
- Tenant and Principal share canonical registry/publication semantics;
- Principal identity is structurally nested under Tenant;
- asynchronous canonical creation is unpublished until setup/commit succeeds;
- preparing creation is cancellable lifecycle state, not only a Promise;
- registry teardown closes admission, cancels preparing transactions, then drains published scopes;
- capability key, value type and authority scope are represented by one `CapabilityToken<T, Scope>`;
- declared scope must correspond to real Cordis lifecycle/authority ownership;
- canonical Tenant/Principal definition identity is scope-local dependency closure, not unrelated whole-plan descendant state;
- Principal owns ephemeral non-reactive Operations;
- one Operation captures its required typed capabilities once and executes semantic work once;
- Cordis reactive `ctx.inject()` is not the user-transaction primitive;
- Agent Integration is explicit and uses DSH-native Agent/Preset/plugin seams;
- DSH Agent/Preset registration remains separate from Runtime service isolation;
- the v0.1 ownership kernel remains shared and is not replaced by Context metadata.

If a feature requires repeated exceptions to these rules, revisit the data model before adding exceptions.

## Strong types and semantics

Prefer TypeScript structures that carry meaning:

- use distinct identity/state/definition types instead of generic dictionaries;
- bind capability key + value type + scope in `CapabilityToken` rather than repeating loose strings;
- normalize optional input into explicit immutable internal data shapes;
- make parent-child structure encode invariants where possible;
- expose only lifecycle states consumers can actually observe;
- distinguish whole-plan diagnostics identity from scope-local canonical creation identity;
- avoid APIs that force upper layers to know lower-layer creation recipes;
- keep one source of truth for package version, DSH baseline and other durable identities.

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
5. rerun the exact-version runtime/integration probes the current architecture actually depends on;
6. fix failures structurally rather than weakening evidence;
7. update current docs while preserving historical release evidence.

See `docs/reference/compatibility.md`.

## v0.3 assumption-first discipline

Development is spec-driven and test-driven, and external framework behavior remains an explicit assumption until proven.

```text
Spec -> Assumption Ledger -> executable probe/contract -> strong types/state -> failing behavior test -> implementation
```

`docs/specs/v0.3-assumptions.json` is the machine-readable ledger. A blocking assumption may be `open` during exploration, but then it must name the public/design gate it blocks. A blocking assumption becomes `proven` only when its repository proof artifact and command execute in CI.

Source reading can explain *why* a behavior probably exists; it does not replace executable proof.

The sequence is iterative: a later vertical slice may expose an over-coupled earlier abstraction. Refactor the live model and Spec instead of preserving prerelease compatibility around disproven structure.

## Vision is not contract

Long-term direction may be documented under `docs/vision/*`, but Vision has a different status from Spec:

- `docs/specs/*` describes implemented/current contracts;
- `docs/vision/*` records non-binding architectural direction;
- Vision does not create a release gate;
- Vision must not be used to pre-approve package names, public APIs or abstract provider families;
- promotion from Vision to Spec requires real vertical-slice evidence.

The current authority-capability Vision prefers `Capability-as-Authority` over permanently exposing raw credentials to Agent/application code. That means a future Broker may become a replaceable plugin capability and service-specific integrations may provide typed clients/transports. This is **not** permission to redesign M4 again or block M5 on a universal Broker API.

The expected evidence sequence is: ship the real MCP integration first, then a second real integration such as ERP, compare repeated authority/refresh/injection/audit semantics, and only then extract the smallest proven public Broker contract if one actually exists.

See `docs/vision/authority-capabilities.md`.

## Package conventions

**Do not create a package because a directory seems useful. Create it only when an independent boundary is real.**

A package must justify at least one independently meaningful property:

- consumer-facing contract/API;
- replaceable provider or integration capability;
- independent lifecycle/composition boundary;
- independent versioning/release boundary;
- product Distribution boundary.

Research, compatibility exploration and one-off evidence should normally live in focused tests/scripts/docs or Git history, not as long-lived workspace packages.

General rules:

- One package = one independently valuable boundary, not one buzzword/capability name.
- Prefer native DSH/Cordis Service, Context, Fiber, Agent/Preset scope and typed protocol seams.
- Contract/default implementation may co-locate early; split only when replacement/lifecycle/versioning value is real.
- Do not scaffold speculative `saas`, Auth, Credentials, MCP, Broker, ERP or Transport packages.
- A future product Distribution may provide opinionated defaults, but Distribution concerns must not dictate Core topology prematurely.

## Dependency and boundary direction

Do not flatten all SaaS concerns into one provider layer. The current semantic direction is:

```text
Product / Transport authentication
        ↓
Trusted Product Ingress
        ↓
Tenant / Principal Runtime
        ↓
Typed Runtime capabilities
        ↓
One-shot Operation
        ↓
Agent Integration
        ↓
Native DSH / Cordis
```

Credentials are a natural Principal-owned Runtime capability in the current v0.3 contract. M5 is expected to prove Agent Integration by consuming Tenant config + Principal credentials + Operation state and composing the native DSH MCP Tools plugin.

Long term, service-specific typed clients/transports may sit above a Broker/authority plugin so Operations consume abilities instead of raw credentials. That remains Vision until multiple real integrations prove the common boundary.

Do not build a parallel protocol stack merely to make every product concern look like a Runtime Provider.

## Tests: contract vs conformance

- **Provider contract suites** prove replaceable Runtime seams (for example `TenantSessionStore` or Runtime Capability Provider Contract).
- **Ingress contract suites** prove trusted product identity maps to the correct canonical Runtime identity without vendor auth leaking into Core.
- **Integration contract suites** prove Runtime state composes into DSH-native Agent behavior without cross-Tenant/Principal leakage.
- **Conformance/invariant suites** prove cross-component properties such as isolation, publication ordering, locality and lifecycle ownership.
- **Compatibility probes** prove assumptions about exact external DSH/Cordis behavior.
- **Packed/registry smoke** proves the artifact users actually install, not only workspace source.

## Definition of done

- architecture/data/state/type implications reviewed globally;
- the change is demonstrably relevant to the current product direction;
- current docs/ADR/spec updated where behavior is decided;
- Vision is not silently promoted into a public contract without real evidence;
- blocking external assumptions are proven or explicitly gate unfinished API design;
- boundary ownership is explicit: Product Ingress vs Runtime capability vs Operation vs Agent Integration;
- exact DSH/Cordis compatibility evidence is green when relevant;
- `pnpm release:check` is green;
- no transport/vendor implementation leaks into the Runtime Core;
- no parallel registry/protocol layer is introduced when a DSH/Cordis native seam exists;
- no speculative package/scaffold is introduced without a real boundary;
- no compatibility shim is added solely to preserve an obsolete prerelease abstraction.
