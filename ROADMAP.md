# Roadmap

Statuses: ✅ done · 🚧 next (settled) · ⏳ deferred (decision-gated).

## Done

- ✅ **Kernel core** — `TenantPrincipal` / `SessionOwner`, claim-once ownership,
  fail-closed authorization, `TenantSessionStore` service seam (in-memory
  provider). `packages/multi-tenant`.
- ✅ **Monorepo** — pnpm workspace with `packages/`, shared `tsconfig.base.json`,
  delegated root scripts, CI.
- ✅ **Web seam spike** — Seam Map, executable facade prototype (6 security
  invariants), and ADR in `packages/multi-tenant-web`. Concluded that web
  enforcement is blocked on an upstream per-connection seam (H3).
- ✅ **Kernel engineering harness** — `TenantSessionStore` contract suite
  (`dsh-multi-tenant/testing`), architecture gate (`pnpm verify`), package
  smoke (`pnpm smoke`), compatibility policy (`docs/compatibility.md`).

## Next (settled)

- 🚧 **H3-only upstream proposal** — a request/connection-scoped principal
  reaching the top-level create path (the only genesis path that needs it).
  fork / subagent / resume are solvable via `setup` + wrapping `ctx.agents` from
  the parent / durable owner, no HTTP principal.

## Deferred (decision-gated)

- ⏳ **H2 — resource model.** Whether Workspace and host-global frames are
  tenant-owned. Product decision; until then, v0 denies non-session host frames.
- ⏳ **Auth providers** (JWT / OIDC / API key). Post-H3; `TenantPrincipalResolver`
  placement still undecided.
- ⏳ **Durable stores** (PostgreSQL / Redis / MySQL). Create a provider package
  once an independent composition / replacement / dependency / lifecycle
  boundary is demonstrated.
- ⏳ **Public-contract freeze** for `dsh-multi-tenant-web` (name and surface are
  provisional until H3 resolves).
- ⏳ Tenant-aware MCP, audit/usage, billing/UI.

## Milestones

- **M0 — Engineering foundation** ✅ monorepo, package rules, spec/ADR
  discipline, CI.
- **M1 — Kernel hardening** ✅ contract-test harness, architecture gate, package
  smoke, compatibility policy.
- **M2 — Session genesis spike** ✅ `setup` hook confirmed as the admission
  point; H3-only upstream proposal (fork / subagent / resume solvable today).
- **M3 — Real web seam spike v2** real `ApiProxy` types, connection lifecycle,
  `respond`, `mux`/`host` → minimal upstream requirement.
- **M4 — Web enforcement.**
- **M5 — Providers** durable stores, auth.
- **M6 — MCP / audit / full-stack preset.**

Each milestone is gated by its predecessor's decision; deferred items above are
pulled forward only when their gate (a decision or an upstream seam) closes.
