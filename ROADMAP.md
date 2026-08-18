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
  blocked on a transport principal-binding problem (H3 hypothesis).
- ✅ **Kernel engineering harness** — `TenantSessionStore` contract suite
  (`dsh-multi-tenant/testing`), architecture gate (`pnpm verify`), package
  smoke (`pnpm smoke`), compatibility policy (`docs/reference/compatibility.md`).
- ✅ **Architecture convergence (M3)** — six-layer architecture
  (`docs/specs/architecture.md`), the Agent `setup` hook confirmed as the
  admission point, and "H3-only" established as a **hypothesis** to verify with
  real transport evidence in M4.

## Next (settled)

- 🚧 **M4 — Real integration proof.** Demonstrate the M3 claims against the real
  DSH runtime *before* filing the upstream proposal:
  1. **Admission decorator** ✅ — real `AgentService`, create / fork / subagent /
     resume, admission inside `setup` before `sessions.enter`.
  2. **Real `ApiProxy` facade** ✅ — the spike `ApiSurface` is gone; the real
     `RpcMethodMap` is exhaustively classified at compile time. The v0 security
     policy is fail-closed: GUARD session points, FILTER only `session.list`,
     ADMIT `session.create` (denied until the admission bridge is installed),
     and DENY search / host-global / deployment-management surfaces that do not
     yet have tenant-safe semantics. Streams / `respond` / `downloads` remain
     denied pending ②-C.
  3. **Real transport prototype** — HTTP / WS / respond / mux / host against the
     real runtime (still `X-Test-Tenant` / `X-Test-User`), locking the tenant-
     isolation invariants, `rpcId → sessionId` respond correlation, and
     unfailing installation ordering.
- 🚧 **M5 — Upstream proposal + web enforcement.** File the request/connection-
  scoped principal seam (plus any other seam M4 actually proves necessary),
  then build the full enforcement on top of it.

## Deferred (decision-gated)

- ⏳ **H2 — resource model.** Whether Workspace and host-global frames are
  tenant-owned. Product decision; until then, v0 denies non-session host frames.
- ⏳ **Tenant-scoped search.** `session.search` is globally ranked/capped today;
  it stays denied until a visibility predicate / scoped candidate set preserves
  correct search semantics.
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
- **M3 — Architecture convergence** ✅ six-layer architecture and H3-only as a
  hypothesis.
- **M4 — Real integration proof** 🚧 admission decorator and real unary
  `ApiProxy` are proven; real HTTP/WS transport remains.
- **M5 — Upstream proposal + web enforcement.**
- **M6 — Providers** durable stores, auth.
- **M7 — MCP / audit / full-stack preset.**
- **M8 — End-to-end tenant-isolation suite** — the executable "crown" that proves
  Tenant A can never touch Tenant B across auth → HTTP/WS → ApiProxy → session →
  agent → MCP → storage.

Each milestone is gated by its predecessor's decision; deferred items above are
pulled forward only when their gate (a decision or an upstream seam) closes.
