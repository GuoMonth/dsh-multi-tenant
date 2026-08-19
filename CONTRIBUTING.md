[简体中文](./CONTRIBUTING.zh-CN.md) | English

# Contributing

## Development model: spec-driven, then test-driven

This repository develops by **spec first, test second, implementation third**.

1. **Spec** — a capability starts as a written spec: a *Seam Map* (surfaces +
   gaps), a contract sketch, or an *ADR* that records the decision. No
   implementation until the contract is written down.
2. **Test** — write the contract test *before* the implementation. A provider's
   contract test is a **shared suite** that any implementation of that seam must
   pass.
3. **Implement** — the smallest thing that satisfies the spec and the test.

Current spec artifacts: `docs/specs/web-seam-map.md` (web surfaces) and
`docs/adr/web-enforcement.md` (hard conclusions + upstream seam
proposal).

## Boundary-first decision rule

Before adding implementation, classify the surface being discussed:

1. **Controlled by this repository → enforce it.** If we own the reliable
   enforcement point, make the rule fail-closed and prove the invariant with
   executable tests.
2. **Owned by the ecosystem → standardize it.** If the guarantee depends on a
   DSH or third-party seam, define the smallest reusable contract / seam,
   publish conformance expectations, and collaborate upstream. A local spike is
   evidence; it is not permission to permanently fork or reimplement the
   upstream subsystem.
3. **Not reliably enforceable → bound it.** State the threat-model / support
   boundary and keep the promise narrow. Do not add broad architectural
   machinery merely to claim coverage over a surface we still cannot prove.

Complexity is not evidence. A PR whose main effect is to absorb an upstream or
uncontrolled responsibility into this repository should be rejected or
deferred unless it demonstrates a stable, independently owned boundary.

## Prerelease-following discipline

DeepSeek Harness is moving quickly, so this project optimizes for **small,
explicit compatibility deltas** rather than long-lived local forks. The current
target baseline is **DSH `0.1.0-rc.7`**.

- Pin explicit prerelease versions; never make compatibility depend on an
  unqualified `latest` tag.
- Record the exact DSH version / commit used by a probe or architectural
  conclusion.
- Historical evidence is immutable evidence: an RC6 proof stays labelled RC6
  until the affected seam is revalidated for RC7. Do not rewrite the label just
  because source looks similar.
- On a DSH bump, identify which seams changed and rerun only the affected
  probes / conformance checks. Do not redesign unchanged layers.
- Keep compatibility upgrades separate from unrelated feature expansion when
  practical, so regressions and upstream changes remain easy to review and
  revert.

See `docs/reference/compatibility.md` for the current target and evidence policy.

## Package conventions

- One package = one **independently composable / replaceable capability**, or
  one **indivisible security boundary**. Never a code-size threshold, and never
  a fragment of a single security invariant.
- Prefer **native DSH/Cordis seams** (Service, event/waterfall, typed
  protocol). Do not invent a Service merely to create a package boundary.
- **Contract and default implementation may co-locate** (especially early). A
  package may be a *pure provider* or a *pure integration*; extract a separate
  package only when a provider gains independent install / replace / lifecycle
  value.
- **Do not scaffold speculative packages.** Create a package only when an
  independent composition / replacement / dependency / versioning / lifecycle /
  security boundary has been *demonstrated* — justified in an ADR, not by a
  code-size or implementation-count threshold.
- Directory names are short (`multi-tenant`); npm names are the published
  identity (`dsh-multi-tenant`). They need not match.

## Dependency direction (non-negotiable)

```
Kernel primitives ◀── capability contracts ◀── providers
```

The kernel owns only the minimal cross-suite tenant primitives (identity,
ownership, authorization) and has zero transport/vendor dependencies — it never
knows JWT / PostgreSQL / HTTP / MCP / Redis. Capability packages own their own
contracts and may depend on the kernel's primitives. Providers depend on the
package that owns their contract. Sibling capabilities do not reach through one
another's implementations. A pull request that adds a transport/vendor
dependency into the kernel is rejected.

## Tests: contract vs conformance

Two test kinds prove different things:

- **Contract Test Suite** — for a *provider seam* (e.g. `TenantSessionStore`).
  Any implementation must pass the same suite as the default provider. This is
  what makes "default ≠ only" hold: a replacement is proven by the contract,
  not by fiat. The kernel ships this suite via the `dsh-multi-tenant/testing`
  subpath (`assertTenantSessionStoreContract`).
- **Conformance / Invariant Suite** — for a *security or integration
  capability* (e.g. web enforcement). It asserts the tenant-isolation
  invariants (A cannot list / history / mux / respond B; concurrent principals
  never cross-talk), which no single provider's unit test can prove.

## Definition of done

- Spec / ADR updated wherever behavior is decided.
- The boundary classification is explicit when a change depends on an upstream
  or otherwise uncontrolled surface.
- Compatibility evidence names the DSH version it was actually validated on.
- Contract and unit tests green (`pnpm test`).
- `pnpm typecheck`, `pnpm build`, `pnpm verify`, and `pnpm smoke` green.
- No transport/vendor dependency leaked into the kernel.
