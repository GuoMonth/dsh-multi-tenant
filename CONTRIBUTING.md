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
- Contract and unit tests green (`pnpm test`).
- `pnpm typecheck`, `pnpm build`, `pnpm verify`, and `pnpm smoke` green.
- No transport/vendor dependency leaked into the kernel.
