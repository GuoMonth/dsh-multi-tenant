# Session Genesis Map

> Static analysis of DSH's session + agent lifecycle. Source read at
> `deepseek-ai/deepseek-harness` @ `47f943859bef60e4160492346772ded9b24f765a`
> (whose `@deepseek-ai/dsh-session` manifest is `0.1.0-rc.5`). The runtime probe
> pins the npm-published `@deepseek-ai/dsh-session@0.1.0-rc.6`; F1/F2 behavior
> is consistent across both.

## 1. Two layers: SessionStore publication vs. Agent genesis

The low-level session store (`SessionStore`, `packages/core/session`) has a
three-step publication transaction:

```
prepare(id?, options)   # construct Session. NOT in store.
enter(session)          # store.set(id, entry). → get/list/history see it.
announce(session)       # emit `session/created` (synchronous dispatch).
```

The **real** genesis path is the agent factory (`packages/core/agent-loop`,
`setupAndPublish`), which wraps that transaction with an **async,
before-visibility `setup` hook**:

```
prepare Session           (sessions.prepare)
prepare Agent             (agent-loop prepare)
await setup(agent.ctx)    # ← ASYNC, before any store entry. Rejection → rollback.
setupCommit?.commit()
publish():
    sessions.enter(session)   # store entry — get/list/history now see it
    agents.enter(agent)
    sessions.announce(session)  # `session/created` (sync dispatch)
    agents.announce(agent)
```

`CreateAgentOptions.setup` / `ResumeAgentOptions.setup` are **public** and are
passed by **all four** genesis paths (create / fork / subagent / resume). DSH
therefore **does** have an existing async, before-visibility admission point —
the `setup` hook.

The open question is **composability, not existence**: `setup` is a per-call
option supplied by the caller (`composition.setup`), not a global middleware.
Whether a third-party plugin can participate in *every* setup unfailingly is
what M2.1 must answer.

## 2. Genesis paths

| Path | Entry (RPC) | Owner source | Goes through | First visible | Rollback |
| --- | --- | --- | --- | --- | --- |
| **create** | `session.create` | caller principal — **not carried** | `ctx.agents.create({sessionId, meta, setup})` → `setupAndPublish` | `sessions.enter` → `list`/`get`; `announce` → `mux`/`host` | `setup` reject or sync `session/created` throw → `dispose()` |
| **fork** | `session.fork` | **inherit parent** | `ctx.agents.create({parentSession, seed, setup})` | same | same |
| **subagent** | `subagent.*` | **inherit parent** | `ctx.agents.create({origin:'subagent', parentSession, setup})` | same | same |
| **resume** | `session.create`(preallocated)/`history`/`prompt` | **restore persisted** | `ctx.agents.resume({resumeSessionId, setup})` | same | same |

## 3. Hook candidates

| Candidate | async | before store entry | composable | Verdict |
| --- | --- | --- | --- | --- |
| `setup` (`CreateAgentOptions.setup`) | ✅ | ✅ (before `sessions.enter`) | ❌ per-call, not global | the right point; **composability is the gap** |
| `session/created` listener | ❌ sync-veto only | ❌ after `enter` | n/a | too late + no async veto |
| wrap `ctx.agents` | ✅ (interpose) | ✅ | ⚠️ needs principal (create) / parent owner (fork/subagent) | possible but coupled to H3 |

## 4. Key findings

- **F1** — `session/created` fires **after** `enter`; the session is already
  store-visible when the event fires. (runtime-confirmed)
- **F2** — `session/created` is **sync-veto-only**: a synchronous throw rolls
  back `enter`, an async listener's rejection is logged, not vetoed. An async
  ownership claim cannot ride it. (runtime-confirmed)
- **F3** — the principal is dropped at the RPC boundary; only **top-level
  create** needs it. fork/subagent need the parent owner, resume needs the
  durable owner — neither needs the HTTP principal.
- **F4** — fork/subagent inherit via `meta.parentSession`. The **store contract**
  (`store.claim(childId, SessionOwner)`) already expresses inheritance; only the
  `MultiTenantService.claimSession()` helper is Principal-oriented. This is an
  **ergonomics** gap, not a capability gap.
- **F5** — resume restores the durable owner. A same-owner claim is
  **idempotent, not a conflict**; resume must read the durable ownership, not
  re-claim.

## 5. Invariant assessment

| Invariant | Status |
| --- | --- |
| 1. No ownership window | ✅ `setup` runs before `sessions.enter` — an admission in `setup` has no window |
| 2. Child inheritance explicit | ⚠️ store contract can express it (F4), but the admission needs the parent owner at the hook |
| 3. No ghost ownership on failure | ✅ reservation tombstone — no access grant; same-owner retry idempotent; different-owner retry conflicts (correct) |
| 4. Resume doesn't steal | ✅ idempotent same-owner claim; restore, don't re-claim |
| 5. Concurrent genesis unique | ✅ `sessionCreations` dedup + `enter` collision check |

## 6. Conclusion (see `session-genesis-adr.md`)

The `setup` hook is the before-visibility async admission point. Composability
is via wrapping `ctx.agents` (the same mechanism H3 needs to wrap `ApiProxy`).
Fork / subagent / resume are solvable today from the parent / durable owner;
only top-level create needs the H3 request-scoped principal. Ghost ownership is
a safe reservation tombstone. The upstream proposal shrinks to **H3 only**.
