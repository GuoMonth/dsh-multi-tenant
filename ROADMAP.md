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

## Next (settled)

- 🚧 **H1 — claim-at-create.** Add an atomic ownership-claim seam to session
  creation so a session is owned *before* it becomes visible to mux/list. This
  is the one core-contract delta from the ADR. (Kernel, `packages/multi-tenant`.)
- 🚧 **Contract-test extraction.** Promote the store contract assertions to a
  shared suite any `TenantSessionStore` implementation must pass — the concrete
  form of "default ≠ only".
- 🚧 **H3 — upstream seam proposal.** File the per-connection `ApiProxy` seam
  proposal against `deepseek-ai/deepseek-harness` (unblocks real web
  enforcement).

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

## Sequencing

The suite is grown in this order: **stabilize the kernel → establish the
contract-test pattern → unblock the web seam upstream → then fan out providers.**
Each deferred item above is pulled forward only when its gate (a decision or an
upstream seam) closes.
