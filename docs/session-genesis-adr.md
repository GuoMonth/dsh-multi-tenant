# ADR — Session Genesis Ownership

> Status: **partial / proposed** — low-level publication confirmed, but the
> admission seam is not yet validated (M2.1). This ADR supersedes the earlier
> draft, which incorrectly claimed no before-visibility async point existed.

## Corrected finding

DSH **does** have an existing before-visibility async point: the Agent
`setup` hook (`CreateAgentOptions.setup` / `ResumeAgentOptions.setup`), awaited
by `agent-loop`'s `setupAndPublish` before `sessions.enter`, with rejection →
rollback. It is used by all four genesis paths (create / fork / subagent /
resume).

The real gap is **composability**: `setup` is a per-call option, not a global
middleware. The open question is whether a third-party plugin can participate
in *every* setup unfailingly.

## Decisions (revised)

### H1 and H3 are distinct seams, coupled only on top-level create

- **H3** (identity propagation) is needed only by **top-level create**, which
  must carry the caller principal.
- **H1** (resource lifecycle) for fork / subagent needs the **parent owner**;
  for resume it needs the **durable owner** — neither needs the HTTP principal.

They may share one upstream proposal, but are two contracts, not one seam.

### Ghost ownership is an OPEN question

Claim-in-`setup` followed by a publish failure (e.g. a sync `session/created`
throw) rolls the session back but leaves the ownership claim behind — the core
deliberately has no `release`. This must be resolved explicitly:

- either the core adds a rollback / reservation+commit semantics, or
- the ADR proves stale ownership is safe (no access grant; same-owner retry
  idempotent; acceptable for a minted UUID).

### Conclusion is NOT final

The outcome depends on M2.1:

- If a plugin can compose into `setup` (wrap `ctx.agents`) → **A** partially
  reopens (existing point usable), modulo H3 for create.
- Otherwise → **B**, but narrowly: a **composable Agent setup/admission
  middleware** (not a new session lifecycle seam).

**C** (core change) is only for ghost-ownership rollback, if invariant 3
demands it — not yet proven.

## Consequence for the kernel

No kernel change yet. Inheritance/restoration are already expressible by the
store contract (`store.claim(childId, SessionOwner)`) and a durable store;
only the `claimSession` helper is Principal-oriented (an ergonomics gap).

## Next (M2.1)

1. Real `ctx.agents.create`/`resume` probe — assert the session is not visible
   inside `setup`, and `setup` rejection never publishes.
2. Determine how a plugin composes into every `setup` (wrap `ctx.agents`?).
3. Resolve ghost-ownership failure semantics (invariant 3).
4. Re-run the probe against `@deepseek-ai/dsh-session@0.1.0-rc.6` and record the
   exact pin in the map.
