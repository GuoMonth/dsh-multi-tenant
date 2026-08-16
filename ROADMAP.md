[简体中文](./ROADMAP.zh-CN.md) | English

# Roadmap

Statuses: ✅ done · 🚧 next (settled) · ⏳ deferred (decision-gated).

## Done

- ✅ **Kernel core** — `TenantPrincipal` / `SessionOwner`, claim-once ownership,
  fail-closed authorization, `TenantSessionStore` service seam (in-memory
  provider). `packages/multi-tenant`.
- ✅ **Monorepo** — pnpm workspace with `packages/`, shared `tsconfig.base.json`,
  delegated root scripts, CI.
- ✅ **Web seam spike (M2)** — Seam Map, executable facade prototype (6 security
  invariants), and the converged web ADR. Concluded that web enforcement is
  blocked on an upstream per-connection seam (H3).
- ✅ **Kernel engineering harness** — `TenantSessionStore` contract suite
  (`dsh-multi-tenant/testing`), architecture gate (`pnpm verify`), package
  smoke (`pnpm smoke`), compatibility policy (`docs/reference/compatibility.md`).
- ✅ **Architecture convergence (M3)** — six-layer architecture
  (`docs/specs/architecture.md`), the Agent `setup` hook confirmed as the
  admission point, and "H3-only" established as a **hypothesis**: enforcement is
  *statically* solvable via a `ctx.agents` decorator + `ApiProxy` facade. The
  **runtime proof is deferred to M4** — the static conclusions are not yet
  demonstrated against the real DSH runtime.

## Next (settled)

- 🚧 **M4 — Real integration proof.** Demonstrate the M3 claims against the real
  DSH runtime *before* filing the upstream proposal:
  1. **Admission decorator** ✅ — wrap the real `AgentService`; assert the
     admission runs inside `setup`, before `sessions.enter`, for
     create / fork / subagent / resume. Proven by
     `scripts/admission-decorator-probe.mjs` (`docs/specs/admission-composition.md`
     §5): a decorator joins every `setup` and the admission runs before
     visibility on all four paths — no new admission seam needed.
  2. **Real `ApiProxy` facade** ✅ — dropped the spike `ApiSurface`; classified the
     real `@deepseek-ai/dsh-host-apiproxy` surface exhaustively (ALLOW / GUARD /
     FILTER / DENY, 52 methods) so a new DSH method fails to compile. Streams
     (`events`) / `respond` / `downloads` are denied until ②-C / H4.
  3. **Real transport prototype** — HTTP / WS / respond / mux / host against the
     real runtime (still `X-Test-Tenant` / `X-Test-User`), locking the six
     tenant-isolation invariants.
- 🚧 **M5 — Upstream proposal + web enforcement.** File the request/connection-
  scoped principal seam (plus any other seam M4 surfaces), then build the
  enforcement on top of it.

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
  point; fork / subagent / resume solvable today.
- **M3 — Architecture convergence** ✅ *static only*: six-layer architecture,
  H3-only as a hypothesis; enforcement statically solvable via `ctx.agents`
  decorator + `ApiProxy` facade.
- **M4 — Real integration proof** 🚧 admission decorator, real `ApiProxy`
  facade + exhaustive classification, real HTTP/WS transport prototype.
- **M5 — Upstream proposal + web enforcement.**
- **M6 — Providers** durable stores, auth.
- **M7 — MCP / audit / full-stack preset.**
- **M8 — End-to-end tenant-isolation suite** — the executable "crown" that proves
  Tenant A can never touch Tenant B across auth → HTTP/WS → ApiProxy → session →
  agent → MCP → storage.

Each milestone is gated by its predecessor's decision; deferred items above are
pulled forward only when their gate (a decision or an upstream seam) closes.
