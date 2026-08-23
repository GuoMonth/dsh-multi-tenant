[简体中文](./session-genesis-map.zh-CN.md) | English

# Session Genesis — historical investigation and current proof

This document records the investigation that established the DSH session/Agent publication seam used by this project. It is evidence, not the current multi-tenant architecture authority; see [`architecture.md`](./architecture.md) for the Runtime Contract.

## Historical source investigation

The original static analysis was performed against DeepSeek Harness commit:

`47f943859bef60e4160492346772ded9b24f765a`

It identified two distinct publication layers.

### Low-level SessionStore

```text
prepare(session)     unpublished
      ↓
enter(session)       registry-visible
      ↓
announce(session)    session/created dispatch
```

`session/created` is therefore not a before-visibility admission point.

### Agent factory genesis

The Agent factory adds an async setup window before publication:

```text
prepare Session
prepare Agent
      ↓
await setup(agentCtx)       unpublished
      ↓
setupCommit?.commit()
      ↓
sessions.enter(session)
agents.enter(agent)
announce / start
```

This is the useful composition boundary: setup failure can abort before the Session/Agent becomes externally visible.

## Current executable evidence

The repository no longer treats the historical source read as sufficient evidence. `scripts/session-genesis-probe.mjs` installs the exact current DSH baseline from `scripts/dsh-target.mjs` (`0.1.1-rc.2`) into a clean temporary consumer and asserts:

1. `session/created` observes the Session already in the store;
2. a synchronous `session/created` throw rolls publication back;
3. an async listener rejection cannot veto already-completed synchronous publication.

`scripts/admission-decorator-probe.mjs` separately proves Agent setup runs before `sessions.enter` across create, fork, subagent and resume paths.

These probes are blocking CI on Node 22.19 and Node 24.

## Architectural consequence

v0.2 applies the same publication principle to Tenant/Principal Runtime nodes:

```text
prepare unpublished subtree
      ↓
await setup(signal)
      ↓
optional synchronous commit()
      ↓
publish canonical node
```

This is intentional semantic alignment with DSH rather than a parallel lifecycle model.

Current DSH baseline/evidence policy lives in [`../reference/compatibility.md`](../reference/compatibility.md).
