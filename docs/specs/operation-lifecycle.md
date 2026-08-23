[简体中文](./operation-lifecycle.zh-CN.md) | English

# Spec — Principal Operation Lifecycle

> Status: P0 design contract. The final public Operation API is intentionally blocked by assumption `A6`.

## Problem

A SaaS request must not call DSH from an arbitrary root Context. Work originates from one canonical Principal and needs an ephemeral lifecycle boundary for dependency acquisition, cancellation, tracing and Agent orchestration.

The target path is:

```text
Authenticated identity
      ↓
canonical Tenant
      ↓
canonical Principal
      ↓
begin one Operation
      ↓
derived Cordis lifecycle boundary
      ↓
acquire required capabilities
      ↓
DSH Agent create / resume / drive
      ↓
Operation teardown
```

## Ownership rule

An Operation belongs to exactly one Principal. It cannot migrate between Principals or Tenants.

The parent/child lifetime rule is:

```text
Tenant owns Principal
Principal owns Operation
Operation owns operation-local resources
```

Disposing a Principal must make all of its Operations quiescent before Principal teardown finishes. This is an externally proven Cordis behavior for child fibers (assumption `A3`).

## Semantic states

The final names are not frozen, but P0 reasoning uses this state machine:

```text
CREATED
  ↓ start
PREPARING
  ├─ dependency / setup failure -> FAILED -> DISPOSED
  ├─ cancel                     -> CANCELLING -> DISPOSED
  └─ ready                      -> ACTIVE
                                   ├─ complete -> DISPOSING -> DISPOSED
                                   ├─ failure  -> FAILED -> DISPOSED
                                   └─ cancel   -> CANCELLING -> DISPOSED
```

A consumer must never observe an Operation as ACTIVE before required capability acquisition and operation setup have succeeded.

## One-shot work vs reactive injection

Cordis `ctx.inject()` is a reactive plugin primitive. The repository probe proves that when a required service disappears, the injected callback unloads; if the service later returns, the callback can run again (assumption `A4`).

Therefore this is **not** an acceptable semantic definition of one user Operation:

```ts
principal.ctx.inject(['agents'], async (ctx) => {
  await performExternallyVisibleUserWork(ctx)
})
```

unless the Operation abstraction proves exactly-once/idempotent behavior across dependency churn.

P0 must explicitly choose and prove a safer model before freezing the public API. Candidate approaches may include a one-shot acquisition phase followed by explicit lifetime ownership, or an idempotent transaction token that rejects callback re-entry. The spec does not choose an implementation prematurely.

This unresolved design point is assumption/gate `A6`.

## Agent boundary

Once an Operation owns a stable Principal-derived context for the duration of one attempt, Agent creation follows the already-proven seam:

```text
Operation Context
   ↓ caller-bound ownerCtx
ctx.agents.create / resume
   ↓
DSH Agent setup transaction
   ↓
DSH publication
```

The Operation must not copy private Cordis isolation maps into `Agent.ctx` and must not create a parallel Agent tenant registry.

## Cancellation

P0 requires one cancellation direction to be structural:

```text
Principal disposal
    ↓
Operation cancellation / teardown
```

Operation-local cancellation must also dispose resources owned by the Operation. The concrete AbortSignal/public API shape is not frozen in this foundation PR.

Cancellation does not automatically mean rollback of durable authorization state. Session ownership reservation/finalization remains a separate product-level concern because the v0.1 ownership kernel is immutable and persistent.

## Failure semantics

Operation failure must distinguish at least these classes conceptually:

- composition/dependency cannot be acquired;
- caller cancellation;
- Agent setup/publication failure;
- Agent execution failure;
- teardown failure.

The framework should preserve causal error information and still attempt quiescent cleanup. Final public error classes belong to the implementation PR, after behavior tests exist.

## Required P0 tests before public API

The first Operation implementation must prove:

1. Operation is structurally bound to one Principal;
2. Tenant A/B and Principal sibling capability state cannot cross;
3. Principal disposal drains active/preparing Operations;
4. Operation-local resources clean up exactly once;
5. dependency churn cannot duplicate externally visible work;
6. create/resume uses the correct Principal-derived DSH owner context;
7. Agent publication failure leaves no live partial Operation/Agent graph;
8. repeated disposal/cancel is idempotent and quiescent.

Until item 5 is proven, the Operation public API remains gated.
