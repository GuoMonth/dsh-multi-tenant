[简体中文](./session-genesis.zh-CN.md) | English

# ADR — Session Genesis Ownership

> Status: **proposed**. Based on the static `../specs/session-genesis-map.md` and the
> `@deepseek-ai/dsh-session@0.1.0-rc.6` runtime probe (F1/F2). The Agent `setup`
> semantics are statically confirmed; a full agent-stack runtime probe is
> deferred (the `AgentLoop` injects `llm`/`tools`/`systemPrompt`, and the source
> is unambiguous).

## Finding

DSH's Agent factory (`packages/core/agent-loop`, `setupAndPublish`) already runs
an **async, before-visibility `setup` hook**:

```
sessions.prepare(id)        # Session constructed, NOT in store
await setup(agent.ctx)      # ← async admission point. Rejection → dispose (rollback).
sessions.enter(session)     # store entry — get/list now see it
sessions.announce(session)  # session/created
```

`CreateAgentOptions.setup` / `ResumeAgentOptions.setup` are public and used by
all four genesis paths (create / fork / subagent / resume).

## Decisions

### 1. The admission mechanism exists; the gap is identity + composability

`setup` is the correct admission point (before `sessions.enter`, async,
rollback-on-reject). But it is a **per-call option**, not a global middleware.
A plugin must **wrap `ctx.agents`** (Cordis service interception) to inject its
admission into every `setup` — the same mechanism H3 needs to wrap the
`ApiProxy`. The `setup` context (`agent.ctx`) exposes the session (hence the
`sessionId` and `meta.parentSession`), so the plugin can derive:

| Path | Identity source | Needs H3? |
| --- | --- | --- |
| create | caller principal | **yes** (principal is not in `setup`) |
| fork / subagent | parent owner via `getSessionOwner(parentSession)` | no |
| resume | durable owner via the durable store | no |

### 2. H1 and H3 are distinct; only top-level create couples them

- **fork / subagent / resume** are solvable today by wrapping `ctx.agents` and
  reading the parent/durable owner — **no HTTP principal required**.
- **top-level create** still needs the caller principal, which is lost at the
  RPC boundary — that is H3, unchanged.

### 3. Ghost ownership is a reservation tombstone (safe), pending a stricter rule

If admission claims inside `setup` and `publish` then fails (e.g. a sync
`session/created` throw), the session rolls back but the ownership claim
remains. This is safe because:

- the session id is a minted `session-<n>` or a client UUID — a failed
  publication never grants access to anything, so the orphaned claim is a
  **reservation tombstone**, not an authorization leak;
- a same-owner retry is **idempotent**; a different-owner retry on the same id
  is a conflict, which is correct (the id was reserved).

This holds for the in-memory and durable stores alike. A stricter
"reservation + commit" semantic is possible later (C) but is **not required**
to close this spike.

## Conclusion

| Option | Verdict |
| --- | --- |
| **A** existing seam sufficient | **partially** — `setup` + wrap `ctx.agents` covers fork/subagent/resume today |
| **B** upstream seam | **narrow** — only a request-scoped principal for top-level create (H3), not a new session lifecycle |
| **C** core change | **not required** — inheritance/restore are already expressible; ghost ownership is a safe tombstone |

The upstream proposal shrinks to **H3 only** (a request/connection-scoped
principal reaching the create path). No new session-lifecycle seam is needed.

## Next

- M3 (web seam spike) proceeds on the **H3-only** upstream proposal.
- Durable `TenantSessionStore` (M5) is still needed for cross-restart resume.
- A full `ctx.agents.create` runtime probe can be added later if the AgentLoop's
  dependencies (`llm`/`tools`/`systemPrompt`) become cheap to fixture.
