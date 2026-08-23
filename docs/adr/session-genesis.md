[简体中文](./session-genesis.zh-CN.md) | English

# ADR — Session / Agent publication boundary

> Status: **accepted finding; implementation guidance updated by v0.2 Runtime Contract**.

## Decision

DSH Agent `setup` is the supported before-publication composition window for Agent create/resume flows.

The relevant lifecycle is:

```text
prepare Session + Agent
        ↓
await setup(agentCtx)          unpublished
        ↓
setupCommit?.commit()
        ↓
sessions.enter / agents.enter
        ↓
announce / start
```

Tenant admission or product composition that must happen before an Agent becomes visible belongs in this setup transaction, not in `session/created` after the Session has already entered its registry.

## Evidence

The original static investigation is preserved in [`../specs/session-genesis-map.md`](../specs/session-genesis-map.md).

Current blocking CI re-proves the contract against the exact DSH baseline `0.1.1-rc.2`:

- `scripts/session-genesis-probe.mjs` proves SessionStore visibility/rollback semantics;
- `scripts/admission-decorator-probe.mjs` proves setup-before-entry across create, fork, subagent and resume;
- `scripts/agent-owner-context-probe.mjs` proves caller-bound Principal-derived Context reaches Agent creation as `ownerCtx`.

## Updated composition guidance

The earlier investigation suggested globally wrapping `ctx.agents` so every call received admission logic. That remains a valid compatibility technique and is useful as a probe, but it is **not the target SaaS architecture**.

The v0.2/v0.3 structural path is:

```text
canonical Tenant
   ↓
canonical Principal
   ↓
derived integration fiber
   ↓ explicit inject: agents
ownerCtx.agents.create(...)
   ↓
Agent setup transaction
```

The SaaS Framework owns the authenticated product entry points, so Agent operations should naturally originate from the correct Principal-derived integration boundary rather than rely on ambient global middleware.

## Durable ownership interaction

The v0.1 `TenantSessionStore` ownership claim is persistent and independent from the in-process Agent lifecycle. If a caller reserves/claims a Session identity before final Agent publication and a later publication step fails, the durable claim may remain as an ownership reservation.

That behavior is safe from cross-tenant takeover because ownership is immutable and same-owner reclaim is idempotent, but product-level v0.3 composition should model reservation/finalization semantics explicitly if it needs reclamation or user-visible failed-session cleanup. Do not silently turn immutable ownership into rollbackable authorization state.

## Consequences

- `session/created` is observation, not async admission.
- DSH Agent setup and v0.2 Tenant/Principal setup intentionally share the same unpublished-setup -> optional commit -> publication vocabulary.
- Principal identity/capability comes from the caller-owned Runtime boundary; `Agent.ctx` remains DSH-owned Agent/Preset scope.
- Persistent ownership remains a separate defense-in-depth plane.

Current architecture authority: [`../specs/architecture.md`](../specs/architecture.md).
