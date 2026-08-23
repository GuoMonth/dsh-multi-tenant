[简体中文](./operation-lifecycle.zh-CN.md) | English

# Spec — Principal Operation Lifecycle

> Status: **implemented and proven for v0.3 M2/M3**. Assumption `A6` is proven by contract tests and the pinned-DSH SaaS Core vertical probe.

## Purpose

A user-visible SaaS action is not a Cordis plugin activation. It is one semantic attempt owned by one canonical Principal.

```text
Tenant
  └─ Principal
       └─ Operation
            ├─ operation-local providers
            ├─ one-shot capability snapshot
            ├─ execute exactly once
            └─ deterministic teardown
```

The structural path into DSH is:

```text
canonical Principal
      ↓
Principal-owned Operation Fiber
      ↓ setup operation-local capabilities
one-shot required-capability snapshot
      ↓
execute exactly once
      ↓
ctx.agents.create / resume
      ↓ caller-bound ownerCtx
DSH Agent setup / publication
      ↓
Operation teardown
```

## Ownership

An Operation belongs to exactly one Principal and cannot migrate between identities.

```text
Tenant owns Principal
Principal owns Operation registry
Operation Fiber owns ephemeral resources
```

Principal disposal closes Operation admission, cancels/drains live Operations, then disposes the Principal Fiber. Tenant disposal therefore recursively quiesces Principal and Operation work.

## State model

The implementation exposes these semantic states:

```text
PREPARING
  ├─ missing dependency / setup failure -> FAILED -> DISPOSING -> DISPOSED
  ├─ cancel                             -> CANCELLING -> DISPOSING -> DISPOSED
  └─ snapshot ready                     -> ACTIVE
                                           ├─ complete -> DISPOSING -> DISPOSED
                                           ├─ failure  -> FAILED -> DISPOSING -> DISPOSED
                                           └─ cancel   -> CANCELLING -> DISPOSING -> DISPOSED
```

`execute()` never runs before setup and required-capability acquisition succeed. Every terminal path attempts quiescent cleanup and retires the Operation from its Principal registry.

## The A6 decision: snapshot, do not reactively execute

Cordis `ctx.inject()` is intentionally reactive: losing a required service unloads the callback and restoring the service may execute the callback again (`A4`). That is correct plugin lifecycle behavior but incorrect user-transaction behavior.

Therefore semantic Operation work **must not** be defined as:

```ts
principal.ctx.inject(['agents'], async (ctx) => {
  await performUserWork(ctx)
})
```

v0.3 chooses a different primitive:

1. create a normal Principal-owned child Fiber without reactive `inject`;
2. materialize operation-local providers;
3. synchronously resolve every required capability from that Operation Context;
4. freeze those resolved values into an `OperationCapabilitySnapshot`;
5. call `execute()` exactly once with that snapshot;
6. dispose the Operation regardless of success, failure or cancellation.

A captured Cordis capability may itself later become unusable if its provider is disposed. The framework does **not** promise provider immortality. The guarantee is narrower and load-bearing: provider churn never re-enters or silently repeats the user's semantic Operation.

This model is proven by tests that remove a provider, install a replacement, and verify the already-running Operation executes once against its original captured capability.

## Capability snapshot

The snapshot is immutable and intentionally small:

```ts
interface OperationCapabilitySnapshot {
  readonly keys: readonly string[]
  has(name: string): boolean
  get<T>(name: string): T | undefined
  require<T>(name: string): T
}
```

It is not a second DI container. Resolution still belongs to Cordis; the snapshot merely records the exact capabilities already resolved for this one semantic attempt.

## DSH Agent boundary

The real public `@deepseek-ai/dsh-agent` `AgentRegistry` is used in CI. Calling a captured `agents` capability from the Operation preserves the Operation Context as DSH's caller-bound `ownerCtx`.

The vertical proof covers concurrent:

- Acme/Alice create;
- Acme/Bob create;
- Globex/Alice create;
- Acme/Alice resume;
- DSH create failure.

For every create/resume, the factory observes the correct Tenant identity, Principal identity, Tenant capability, Principal capability and Operation-local capability. A factory failure is preserved as the Operation error and the failed Operation retires completely.

Operation does not copy private Cordis isolation maps into `Agent.ctx`, does not invent an Agent tenant registry, and does not redefine DSH Agent/Preset scope semantics.

## Cancellation and teardown

Cancellation is structural:

```text
Principal disposal
      ↓ close Operation admission
cancel/drain Operations
      ↓
dispose Principal
```

An Operation also owns an `AbortSignal` for explicit cancellation. Repeated `cancel()` / `dispose()` calls are idempotent and join the same quiescent teardown.

Durable Session ownership is separate. Cancelling an Operation does not automatically roll back the v0.1 persistent authorization invariant.

## Error boundary

The first public taxonomy is intentionally semantic rather than vendor-specific:

- `OperationRegistryClosedError` — no new work after Principal teardown starts;
- `OperationDependencyUnavailableError` — required capability absent before execution;
- `OperationCancelledError` — caller/owner cancellation;
- downstream DSH/provider errors — preserve their causal error instead of wrapping away meaning.

Cleanup still runs after downstream failure.

## Executable evidence

The current contract is protected by:

- `packages/multi-tenant/tests/operation.test.ts` — one-shot snapshot, missing dependency, Principal drain, idempotent teardown;
- `scripts/cordis-operation-lifecycle-probe.mjs` — Cordis child ownership and reactive `inject` behavior;
- `scripts/saas-core-vertical-slice-probe.mjs` — real DSH AgentRegistry create/resume/failure from multi-tenant Operations;
- Node 22.19 and Node 24 GitHub Actions lanes.

`A6` is therefore `proven`, not an open design gate.
