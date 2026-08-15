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

Current spec artifacts: `packages/multi-tenant-web/SEAM-MAP.md` (web surfaces)
and `packages/multi-tenant-web/ADR.md` (hard conclusions + upstream seam
proposal).

## Package conventions

- One package = one **replaceable capability** (a Cordis service seam). Never a
  code-size threshold, and never a fragment of a single security invariant.
- A package ships: its **Service definition** (the contract), its **default
  provider**, and a `cordis.patch.yml` bundle row that composes it.
- **Do not scaffold empty packages.** Create a package only when a second real
  implementation of a seam exists, or when the seam is a distinct security
  surface of its own.
- Directory names are short (`multi-tenant`); npm names are the published
  identity (`dsh-multi-tenant`). They need not match.

## Dependency direction (non-negotiable)

```
Core ──▶ Contract ◀── Provider
```

The kernel's contracts have zero transport/vendor dependencies. Providers
depend on the kernel's contract; the kernel never knows JWT / PostgreSQL /
HTTP / MCP / Redis. A pull request that adds such a dependency into the kernel
is rejected.

## Contract tests

Every replaceable seam has a shared contract-test suite. A third-party
implementation must pass the same suite as the default provider. This is what
makes "default ≠ only" hold: a replacement is proven by the contract, not by
fiat.

## Definition of done

- Spec / ADR updated wherever behavior is decided.
- Contract and unit tests green (`pnpm test`).
- `pnpm typecheck` and `pnpm build` green.
- No transport/vendor dependency leaked into the kernel.
