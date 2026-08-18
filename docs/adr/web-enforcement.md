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
| **Admission composability** | **runtime-proven (M4 ②-A)** — a decorator can join `ctx.agents.create/resume` and its admission runs inside `setup` before `sessions.enter`; *unfailing transport/scope installation* remains part of ②-C. |
| **Unary enforcement** | **runtime shape implemented (M4 ②-B)** — `bindTenant` wraps the real `ApiProxy` and every `RpcMethodMap` member is exhaustively classified at compile time. The policy is deliberately fail-closed: session points are guarded, only `session.list` is post-filtered, `session.create` is admission-gated, and unmodelled host/global management surfaces are denied. |
| **Streams / respond** | **pending M4 ②-C** — currently denied. `events` needs principal-bound filtering; `respond` needs runtime proof of `rpcId → sessionId` correlation before authorization. |
| **Ghost ownership** | **v0 security-safe tombstone** (M2) — session ids must not be reusable; cleanup semantics deferred. |

## The remaining transport question — H3

The facade takes a `TenantPrincipal`, but the principal is **dropped at the RPC
boundary** (`ConnectionRpcHandler = (endpoint, payload, signal)`). It exists
only at the transport boundary (HTTP fetch `new Request(req)`, WS upgrade
`handleMux(req)`), and DSH then collapses into a shared singleton
(`HostConnectionService`, one `ApiProxy`, one `WebSocketDownlinks`). There is
currently no proven per-request/per-connection binding point for the tenant
principal.

The current hypothesis is therefore **H3**: the real transport needs a
request/connection-scoped principal seam. M4 ②-C must prove that this is the
only missing upstream requirement; the upstream proposal is not filed before
that proof.

## Security policy for the v0 web surface

`RpcMethodMap` coverage is exhaustive, but exhaustive coverage does not mean
that every host capability is tenant-safe. Until a resource or privilege model
exists, v0 follows these rules:

- session-keyed point operations → **GUARD**;
- `session.list` → **FILTER** (post-filtering preserves its current semantics);
- `session.create` → **ADMIT**, and is denied by the standalone facade until the
  pre-publication admission bridge is installed;
- `session.search` → **DENY** for now because DSH returns a globally ranked,
  capped result set; post-filtering it is not a correct tenant-scoped query;
- deployment/host management (`settings.*`, `credentials.*`, host/workspace,
  preset authoring, host-scoped LLM configuration/discovery) → **DENY**;
- explicitly tenant-neutral read-only discovery may be **ALLOW** (currently
  `agentPreset.list`).

## Explicitly not required by current evidence

- a kernel change (H1 resolved via `setup`);
- a new global setup-contribution registry (the admission decorator is
  runtime-feasible; installation ordering is verified in ②-C).

No claim is made yet that `respond` needs — or does not need — a dedicated
upstream seam. The current implementation denies it until M4 ②-C proves a safe
correlation path.

## Next

②-A (admission decorator) and ②-B (real `ApiProxy` + exhaustive unary
classification) are complete. Remaining M4 work is ②-C: real HTTP/WS transport,
principal lifetime, mux/host filtering, `respond` correlation, and unfailing
installation ordering. Only then file the upstream proposal and proceed to full
web enforcement.
