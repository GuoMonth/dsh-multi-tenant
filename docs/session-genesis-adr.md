# ADR — Session Genesis Ownership

> Status: **spike conclusion (proposed)**. Based on the static
> `session-genesis-map.md` plus a runtime probe against
> `@deepseek-ai/dsh-session@0.1.0-rc.6` (probe output below).

## Confirmed findings

The runtime probe confirmed the static map:

```json
{ "F1": {"visibleAtCreated": true},
  "F2_sync": {"threw": true, "sessionCount": 0},
  "F2_async": {"threw": false, "sessionCount": 1} }
```

- **F1** — when `session/created` fires, the session is **already** in the store
  (`get`-visible). It is not a before-visibility admission point.
- **F2** — a **synchronous** `session/created` throw vetoes publication (store
  entry rolled back); an **async** listener's rejection is logged, not vetoed.
  Ownership claim is async, so it cannot ride this veto.
- **F3** — the principal is dropped at the RPC boundary
  (`(endpoint, payload, signal)`); no genesis path carries it.
- **F4** — fork / subagent carry `meta.parentSession`; ownership is inheritance.
- **F5** — resume restores from persistence; ownership is restoration, not claim.

## Decision

### A — existing seam sufficient → **ruled out**

`session/created` fires after store entry (F1), cannot veto async claims (F2),
and has no principal (F3). There is no existing before-visibility,
async-compatible, identity-carrying admission point.

### B — DSH needs a minimal session-genesis admission seam → **required**

Propose an upstream seam, awaited between `prepare` and `enter`, that carries
the identity to claim with:

| Path | Identity carried |
| --- | --- |
| create | the authenticated `TenantPrincipal` |
| fork / subagent | the parent `sessionId` (owner inherits) |
| resume | the `sessionId` (owner restored, not re-claimed) |

This is **the same transport seam H3 needs** — a request/connection-scoped
principal at genesis. H1 and H3 are one upstream problem, not two.

### C — core contract change → **not required, minor optional**

The existing `claimSession` + `getSessionOwner` already express inheritance
(lookup parent owner → claim child) and restoration (durable store read, no
re-claim). A small convenience — accept a `SessionOwner` directly, or add
`claimInherited(childId, parentId)` — removes the awkwardness of reconstructing
a fake `TenantPrincipal`, but is not a blocker.

## Consequence for the kernel

No kernel change now. The kernel's `claim-once` + fail-closed semantics survive
this spike intact. The unblock is upstream (B) + a durable `TenantSessionStore`
(M5) for cross-restart restoration — not a contract delta.

## Next

- Upstream proposal: a session-genesis admission seam (async, before `enter`,
  identity-carrying) — combined with the H3 request-scoped-principal seam.
- M3 (web seam) proceeds against this same upstream seam rather than opening a
  separate design surface.
