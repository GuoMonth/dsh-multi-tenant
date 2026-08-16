[简体中文](./web-enforcement.zh-CN.md) | English

# ADR — DSH Web Multi-Tenant Enforcement (converged)

> Status: **proposed**. Converges M2 (session genesis), M3.0 (admission
> composition), and the web Seam Map (`../specs/web-seam-map.md`). Supersedes the
> earlier web ADR (which predated M2/M3.0).

## Context

The core (`dsh-multi-tenant`) owns session ownership + fail-closed
authorization. The question is the **minimal upstream seam** needed to enforce
multi-tenancy across DSH Web's surfaces.

## Converged findings

| Concern | Status |
| --- | --- |
| **H1 — session genesis** | **resolved (M2)** — the Agent `setup` hook is the before-visibility async admission point; no core change. |
| **Admission composability** | **runtime-proven (M4 ②-A)** — a plugin wraps `ctx.agents` and its admission runs inside `setup` before `sessions.enter`; *unfailing* scope installation (before the host's own `create`) is ②-C. |
| **Enforcement surfaces** (unary guard/filter, mux/host stream filter, respond guard) | **solvable** — the closure-bound `ApiProxy` facade (PR #2's `bind-tenant.ts`) wraps the session-bearing methods and streams. |
| **Ghost ownership** | **v0-safe tombstone** (M2) — session ids must not be reusable; cleanup semantics deferred. |

## The remaining gap — H3 (request-scoped principal)

The facade takes a `TenantPrincipal`, but the principal is **dropped at the RPC
boundary** (`ConnectionRpcHandler = (endpoint, payload, signal)`). It exists
only at the transport boundary (HTTP fetch `new Request(req)`, WS upgrade
`handleMux(req)`), and DSH then collapses into a shared singleton
(`HostConnectionService`, one `ApiProxy`, one `WebSocketDownlinks`). There is
**no per-connection scope** to bind the facade to.

## Decision

The **minimal upstream seam is H3 only** — a request/connection-scoped
principal binding point, which makes the `ApiProxy` facade and the `ctx.agents`
decorator installable **per-connection** rather than process-wide.

Explicitly **not** required:

- a core change (H1 resolved via `setup`);
- a respond-specific seam (the facade's `api.respond` wrap guards it);
- a global setup-contribution registry (the `ctx.agents` decorator suffices —
  an upstream middleware is only a cleaner optional alternative).

## Next

②-A (admission decorator) is runtime-proven via
`scripts/admission-decorator-probe.mjs`. Remaining M4 work: ②-B (real `ApiProxy`
facade + exhaustive classification) and ②-C (real HTTP/WS transport prototype).
Then file the H3 upstream proposal (request/connection-scoped principal seam)
and build the full enforcement on top of it.
