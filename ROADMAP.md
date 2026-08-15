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

- 🚧 **H1 — Session Genesis Ownership.** Establish (or inherit, for fork /
  subagent) ownership *before* a session becomes visible, for every genesis
  path — create, fork, subagent, resume/attach. Determine whether the required
  seam belongs upstream in DSH's lifecycle or needs a kernel-contract delta;
  do not change the kernel until this is proven. (Kernel,
  `packages/multi-tenant`.)
- 🚧 **H3 — request/connection-scoped principal binding.** State the upstream
  requirement (principal scoped to request/connection, non-ambient, enforceable
  across unary / respond / stream lifetime), with a per-connection `ApiProxy`
  seam as the preferred candidate, against `deepseek-ai/deepseek-harness`.

## Deferred (decision-gated)

- ⏳ **H2 — resource model.** Whether Workspace and host-global frames are
  tenant-owned. Product decision; until then, v0 denies non-session host frames.
- ⏳ **Auth providers** (JWT / OIDC / API key). Post-H3; `TenantPrincipalResolver`
  placement still undecided.
- ⏳ **Durable stores** (PostgreSQL / Redis / MySQL). Create packages only when a
  real second implementation lands.
- ⏳ **Public-contract freeze** for `dsh-multi-tenant-web` (name and surface are
  provisional until H3 resolves).
- ⏳ Tenant-aware MCP, audit/usage, billing/UI.

## Milestones

- **M0 — Engineering foundation** ✅ monorepo, package rules, spec/ADR
  discipline, CI.
- **M1 — Kernel hardening** 🚧 extract the shared contract-test harness; pin the
  current kernel contract with tests; publication/version policy.
- **M2 — Session genesis spike** create / fork / subagent / resume →
  ownership-before-visibility; decide whether the seam is upstream or a kernel
  delta.
- **M3 — Real web seam spike v2** real `ApiProxy` types, connection lifecycle,
  `respond`, `mux`/`host` → minimal upstream requirement.
- **M4 — Web enforcement.**
- **M5 — Providers** durable stores, auth.
- **M6 — MCP / audit / full-stack preset.**

Each milestone is gated by its predecessor's decision; deferred items above are
pulled forward only when their gate (a decision or an upstream seam) closes.
