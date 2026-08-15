# Session Genesis Map

> Static analysis of DSH's session lifecycle. Based on
> `deepseek-ai/deepseek-harness` @ `47f943859bef60e4160492346772ded9b24f765a`.
> This is the **static** half of the M2 spike; a runtime probe confirms it next.

## 1. The publication transaction (`prepare → enter → announce`)

The session store (`packages/core/session/src/index.ts`, `SessionStore extends
Service`) splits creation into three **public** primitives, folded into one
synchronous `ctx.effect`:

```
prepare(id?, options)        # construct Session (mint or validate id, freeze header). NOT in store.
        │
enter(session)               # store.set(id, entry) + install publication hooks. RETURNS detach disposer.
        │                    #   → `ctx.sessions.get`/`.list`/`history` now see it.
announce(session)            # emit `session/created` (synchronous dispatch).
        │                    #   → mux `session/subscribed`, `host/session-added` broadcast from listeners.
        ▼
visible (list + mux + host)
```

Key facts from the source:

- `enter` and `announce` run **back-to-back synchronously** inside the effect,
  so the intermediate state ("in store but not announced") is **not observable**
  by any async observer — there is no cross-tick window.
- `announce` dispatches `session/created` **synchronously**. A synchronous
  listener that **throws** vetoes publication: the effect-yielded detach rolls
  back `enter`. An **async** listener's rejection is only logged — **too late to
  veto** (`announce` body: "rejection is too late to roll back").
- `create()` is a convenience wrapper (`prepare` → effect(`enter` → `announce`)).

## 2. Genesis paths

| Path | Entry (RPC) | Owner source | Goes through | First visible | Rollback |
| --- | --- | --- | --- | --- | --- |
| **create** | `session.create` | the caller principal — **not carried** | `ensureSession` → `ctx.agents.create({sessionId, meta})` → `prepare/enter/announce` | `enter` → `list`/`get`; `announce` → `mux`/`host` | sync `session/created` throw rolls back `enter` |
| **fork** | `session.fork` | **inherit parent** | `ctx.agents.create({sessionId: childId, meta: {parentSession: source.id, seedLength}})` | same as create | same |
| **subagent** | `subagent.*` (spawn) | **inherit parent** | `ctx.agents.create({origin:'subagent', parentSession, …})` via `ctx.subagents` | same as create | same |
| **resume** | `session.create` (preallocated id) / `history` / `prompt` | **restore persisted** | `persistence.list().find(id)` → `ctx.agents.resume({resumeSessionId})` | `enter`/`announce` on the restored session | same |

Details:

- **create** (`packages/host/apiproxy/src/api-proxy.ts` `ensureSession`, ~L1618):
  dedups via a `sessionCreations` map, checks `ctx.sessions.get` / `ctx.agents.get`
  for an already-live session, then `ctx.agents.create(...)`.
- **fork** (~L2363): `ctx.agents.create({sessionId: childId, seed: events.slice(0,cut),
  meta: {parentSession: source.id, …}})` — the child's owner must be the parent's.
- **resume** (~L1640): when the client preallocated an id that exists in
  `sessionPersistence`, it `inspect`s + `ctx.agents.resume(...)` — ownership must
  be **restored**, not re-claimed.

## 3. Ownership hook candidates

| Candidate | Sync veto? | Before store entry? | Principal available? | Verdict |
| --- | --- | --- | --- | --- |
| `session/created` listener | ✅ (throw) | ❌ fires **after** `enter` | ❌ | natural event, but claim is async (no veto) and no principal |
| `prepare`/`enter`/`announce` primitives | ✅ (own the transaction) | ✅ (between `prepare` and `enter`) | ❌ (caller supplies it) | invasive: re-implement the agent factory's transaction |
| wrap `ctx.agents` / `ctx.sessions` | ✅ (interpose) | ✅ | ❌ (RPC handler already dropped it) | same principal-loss problem |
| new DSH lifecycle seam | TBD | TBD | TBD | does not exist today |

## 4. Key findings

- **F1 — no observable window, but no hook either.** `enter`→`announce` are
  synchronous, so `list`/`mux`/`host` can't observe a half-created session. But
  there is no seam to establish ownership *before* `enter`.
- **F2 — `session/created` is sync-veto-only.** Ownership claim is **async**
  (`TenantSessionStore.claim` returns a Promise, for durable stores). An async
  `session/created` listener cannot veto — its rejection is logged. So the event
  cannot itself be the ownership-admission point.
- **F3 — H1 and H3 are coupled.** The principal is dropped at the RPC boundary
  (`ConnectionRpcHandler = (endpoint, payload, signal)`). Even with a
  before-visibility hook, there is no principal to claim with. Session genesis
  cannot be solved independently of principal propagation.
- **F4 — fork/subagent are inheritance, not fresh claim.** They carry
  `meta.parentSession`. Ownership must be *derived from the parent*, which a
  `claimSession(principal)` call does not express — it would need a
  `claimChild(parentSessionId, childSessionId)` or equivalent.
- **F5 — resume is restoration, not claim.** A resumed session's ownership must
  be restored from persisted state; the current `claimSession` (claim-once,
  conflict on existing) would treat a legitimate resume as a conflict.

## 5. Invariant assessment (static)

| Invariant | Static status |
| --- | --- |
| 1. No ownership window | ⚠️ no observable window (synchronous), but no hook to claim *before* `enter` |
| 2. Child inheritance explicit | ⚠️ `parentSession` meta exists, but no seam to perform the inheritance |
| 3. No ghost ownership on failure | ⚠️ sync `session/created` throw rolls back `enter` — but claim is async, so it can't ride that rollback |
| 4. Resume doesn't steal | ❌ `claimSession` would conflict on a legitimate resume; needs a restore path |
| 5. Concurrent genesis unique | ✅ `sessionCreations` dedup map + `enter` collision check give one winner |

## 6. Preliminary lean (static only)

The `session/created` event + the `prepare/enter/announce` primitives are the
only existing seams, and **neither can carry a before-visibility, async,
principal-carrying ownership admission**. Two coupled gaps block a clean
conclusion-A: (a) no principal at genesis (H3), and (b) no admission hook that
fits the async claim (H1). The next step is the **runtime probe** — confirm on a
real DSH runtime that (1) a synchronous `session/created` listener fires after
`enter`, and (2) an async claim cannot veto — before committing the ADR to A/B/C.
