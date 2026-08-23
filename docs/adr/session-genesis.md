[简体中文](./session-genesis.zh-CN.md) | English

# ADR — Session / Agent publication boundary

> Status: **accepted runtime fact**.

## Decision

DSH Agent `setup` is the supported before-publication composition window for Agent creation flows.

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

Work that must complete before an Agent becomes visible belongs in this transaction, not in `session/created` after registry publication.

## Current evidence

Blocking CI re-proves the facts that still matter against the exact DSH baseline:

- `scripts/session-genesis-probe.mjs` — Session visibility and rollback semantics;
- `scripts/agent-owner-context-probe.mjs` — a Principal-derived Context reaches Agent creation as caller-bound `ownerCtx` while preserving tenant/principal capability resolution.

Historical experiments around globally decorating `ctx.agents`, Web transport enforcement, and earlier static source maps remain available in Git history. They are not part of the current architecture contract.

## Composition guidance

The target structural path is:

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

The SaaS Framework owns authenticated product entry points. Agent work should therefore originate from the correct Principal-derived boundary rather than rely on ambient global middleware.

## Durable ownership interaction

The v0.1 `TenantSessionStore` ownership claim is persistent and independent from the in-process Agent lifecycle. If product composition reserves ownership before final Agent publication, failed publication may leave a durable ownership reservation.

That is safe from cross-tenant takeover because ownership is immutable and same-owner reclaim is idempotent. If v0.3 needs reclamation or user-visible failed-session cleanup, model reservation/finalization explicitly rather than making authorization state implicitly rollbackable.

## Consequences

- `session/created` is observation, not async admission;
- DSH Agent setup and Tenant/Principal setup intentionally share unpublished setup → optional commit → publication semantics;
- Principal identity/capability comes from the caller-owned Runtime boundary;
- `Agent.ctx` remains DSH-owned Agent/Preset scope;
- persistent ownership remains a separate defense-in-depth plane.

Current architecture authority: [`../specs/architecture.md`](../specs/architecture.md).
