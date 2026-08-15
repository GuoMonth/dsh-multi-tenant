# ADR — DSH Web Multi-Tenant Enforcement Model

> Status: **spike conclusion (proposed)**. Based on `SEAM-MAP.md` @
> `deepseek-ai/deepseek-harness` `47f943859bef60e4160492346772ded9b24f765a`
> (static analysis) + the executable facade prototype (`src/bind-tenant.ts`,
> 6 security invariants). H3/H4 are static conclusions — a real-DSH runtime test
> would confirm them once the upstream seams exist.

## Context

The core (`dsh-multi-tenant`) owns session ownership + fail-closed
authorization. This spike asked whether DSH Web's current public seams can form
a complete, non-ambient, default-deny multi-tenant boundary. Answer: **not
without upstream work** — three concrete seams are insufficient (see below), but
the *enforcement model* (closure-bound facade) is correct and fully provable.

## Decision 1 — H1: session.create ownership lifecycle

**Finding.** `session.create(id?: SessionId)` lets the client preallocate a
session id; ownership is claimed *after* creation. The core is claim-once with
no `release`/`reassign`, so "claim-then-delete-on-failure" is impossible. There
is a window where a session exists but has no owner.

**Decision.** The core needs a **claim-at-create seam**: ownership must be
established atomically with (or before) the session becomes visible to
`events.mux` / `session.list`. This is a **core-contract delta** (separate PR),
not a web-integration fix. Until then, the core's fail-closed default (unknown
session → deny) bounds the *data* leak, but does not hide session *existence*
on the mux/host baseline.

## Decision 2 — H2: resource ownership model

**Finding.** `events.host` mixes three resource classes: `Session` frames,
`Workspace` frames (`host/workspace-*`), and host-global frames
(`host/remote-event`, `host/archived-sessions-changed`). `SessionOwner` only
covers the first.

**Decision.** v0 is **session-only**: `Workspace` and host-global frames are
**denied/redacted** in multi-tenant mode (fail-closed), not filtered. Whether
Workspace is tenant-owned is a *product* decision to be made explicitly later;
if yes, `SessionOwner` generalizes to a resource-owner model. Do not guess it.

## Decision 3 — H3: principal propagation + upstream sufficiency

**Finding.** The principal is available at the transport boundary (HTTP fetch
`new Request(req)`, WS upgrade `handleMux(req: IncomingMessage)`), but DSH then
collapses into a shared singleton graph: one `HostConnectionService`, one
`ApiProxy`, one `WebSocketDownlinks`, one global `events.mux`. The unary handler
`(endpoint, payload, signal)` carries no principal/Request, and there is no
per-connection scope.

**Decision.** The **closure-bound facade** (`bindTenant(apiProxy, principal)`)
is the correct propagation model — the principal is closed over, never in
ambient/shared context, so concurrent tenants cannot cross-talk (proven by the
prototype). **But it cannot be installed at the current seams** without a
per-connection `ApiProxy` (or per-connection context). This requires an
**upstream DSH seam**, not more plugin-side cleverness.

## Decision 4 — H4: bidirectional RPC ownership

**Finding.** Approval/question is server-initiated: `approval/requested` →
`POST /api/respond` with a `ClientResponse` (`clientResponseSchema`), **not** a
`ClientRequest`; it is special-cased in `toFetchHandler`, outside
`rpc.intercept()`. The response carries `sessionId`, so ownership *is*
checkable — but there is no shared seam with the unary path.

**Decision.** `respond` needs its own guard (the facade wraps `api.respond`).
This has the same H3 dependency: it is guardable at the `ApiProxy` level only if
the facade can be installed there, which needs the per-connection seam. In
multi-tenant mode, an unanswered/foreign `respond` is a **cross-tenant privilege
execution** (not just a leak), so this is a hard, not soft, requirement.

## Coverage / Evolution Contract (two legs)

1. **Compile-time exhaustive (feasible).** The unary surface (`RpcMethodMap`)
   and the stream frames (`MuxFrame`/`HostFrame`) are **closed typed unions**.
   A classifying facade can enumerate every member, so a DSH version bump that
   adds a method/frame fails to typecheck until it is classified. This is the
   primary anti-drift guarantee.
2. **Runtime default-deny (required backstop).** Raw HTTP routes
   (`webServer.route` runtime registration) and stream-level frames
   (`stream/error`) are not part of a closed union. The facade must **deny by
   default** anything it cannot classify — proven by prototype invariant #6
   (unclassifiable frame dropped).

## Package shape recommendation

- Keep `dsh-multi-tenant` as the stable core (no transport deps).
- `dsh-multi-tenant-web` hosts the facade + classification, but it is **blocked
  on H3** for real installation. Until the upstream per-connection seam lands,
  it remains a spike artifact + spec.
- **Do not** build a `-web-auth`/JWT package yet: authentication is orthogonal
  and belongs to a `TenantPrincipalResolver` seam decided *after* H3.

## Upstream seam proposal (to DeepSeek Harness)

1. **Per-connection `ApiProxy` (or per-connection context).** Expose a seam so a
   plugin can supply a principal-bound `ApiProxy` per connection (at WS upgrade /
   fetch), instead of one shared singleton. This unblocks H3 + H4.
2. **Fold `/api/respond` into a guardable path.** Route `respond` through the
   same interceptor model as unary, so one guard covers both directions (H4).
3. **(Core) claim-at-create.** A `session.create` option/hook to claim ownership
   atomically with creation (H1) — lands in `dsh-multi-tenant`, not here.

## Not decided / follow-up

- Workspace ownership (product decision, H2).
- `TenantPrincipalResolver` placement and auth mechanisms (post-H3).
- Real-DSH runtime integration test to confirm H3/H4 (after upstream seam #1).
