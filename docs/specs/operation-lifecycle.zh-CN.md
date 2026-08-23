[English](./operation-lifecycle.md) | 简体中文

# Spec —— Principal Operation Lifecycle

> Status：**v0.3 M2 / M3 已实现并证明**。Assumption `A6` 已由 contract test 与 pinned DSH SaaS Core vertical probe 证明。

## 目标

一次用户可见的 SaaS 动作不是一次 Cordis plugin activation，而是归属于一个 canonical Principal 的一次 semantic attempt。

```text
Tenant
  └─ Principal
       └─ Operation
            ├─ operation-local providers
            ├─ one-shot capability snapshot
            ├─ execute exactly once
            └─ deterministic teardown
```

进入 DSH 的结构路径：

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

一个 Operation 只能属于一个 Principal，不能跨 Principal / Tenant 迁移。

```text
Tenant owns Principal
Principal owns Operation registry
Operation Fiber owns ephemeral resources
```

Principal dispose 会先关闭 Operation admission，再 cancel / drain 已存在的 Operation，最后 dispose Principal Fiber。因此 Tenant teardown 会递归让 Principal 与 Operation 全部进入 quiescent。

## State Model

当前实现使用下面的 semantic state：

```text
PREPARING
  ├─ missing dependency / setup failure -> FAILED -> DISPOSING -> DISPOSED
  ├─ cancel                             -> CANCELLING -> DISPOSING -> DISPOSED
  └─ snapshot ready                     -> ACTIVE
                                           ├─ complete -> DISPOSING -> DISPOSED
                                           ├─ failure  -> FAILED -> DISPOSING -> DISPOSED
                                           └─ cancel   -> CANCELLING -> DISPOSING -> DISPOSED
```

setup 与 required capability acquisition 成功以前，`execute()` 不会运行。所有 terminal path 都会尝试 quiescent cleanup，并把 Operation 从 Principal registry 中 retire。

## A6 的最终选择：Snapshot，而不是 Reactive Execute

Cordis `ctx.inject()` 本来就是 reactive primitive：required service 消失时 callback unload，service 恢复以后 callback 可能重新执行（`A4`）。对于 plugin lifecycle 这是正确语义，但对于一次用户 transaction 是错误语义。

所以 semantic Operation **不能**这样定义：

```ts
principal.ctx.inject(['agents'], async (ctx) => {
  await performUserWork(ctx)
})
```

v0.3 采用另一套结构：

1. 创建普通的 Principal-owned child Fiber，不使用 reactive `inject`；
2. materialize operation-local provider；
3. 在 Operation Context 上一次性解析全部 required capability；
4. 冻结成 `OperationCapabilitySnapshot`；
5. 只调用一次 `execute()`；
6. 无论 success / failure / cancellation 都 dispose Operation。

捕获到的 Cordis capability 在其 provider 后续被 dispose 后，可能自己变得不可用。Framework **不承诺 provider 永生**。真正的保证更窄但更关键：provider churn 永远不会让同一个用户 Operation 被 re-enter 或悄悄重复执行。

Contract test 会在 Operation 运行期间卸载 v1 provider、挂载 v2 provider，并证明当前 Operation 仍然只执行一次、消费最初捕获的 capability。

## Capability Snapshot

Snapshot 是 immutable 且刻意保持小：

```ts
interface OperationCapabilitySnapshot {
  readonly keys: readonly string[]
  has(name: string): boolean
  get<T>(name: string): T | undefined
  require<T>(name: string): T
}
```

它不是第二套 DI Container。Capability resolution 仍然属于 Cordis；Snapshot 只是记录这个 semantic attempt 已经解析出的精确 capability 集合。

## DSH Agent Boundary

CI 直接运行真实 public `@deepseek-ai/dsh-agent` `AgentRegistry`。从 Operation 调用捕获到的 `agents` capability 时，DSH factory 收到的 caller-bound `ownerCtx` 仍然是正确的 Operation Context。

Vertical proof 并发覆盖：

- Acme / Alice create；
- Acme / Bob create；
- Globex / Alice create；
- Acme / Alice resume；
- DSH create failure。

每次 create / resume 中，factory 都能看到正确的 Tenant identity、Principal identity、Tenant capability、Principal capability 和 Operation-local capability。Factory failure 会保留为 Operation 的 causal error，同时 failed Operation 完整 retire。

Operation 不复制 Cordis 私有 isolation map 到 `Agent.ctx`，不创建平行 Agent tenant registry，也不重新定义 DSH Agent / Preset scope 语义。

## Cancellation 与 Teardown

Cancellation 从结构上成立：

```text
Principal disposal
      ↓ close Operation admission
cancel / drain Operations
      ↓
dispose Principal
```

Operation 自己也拥有 `AbortSignal` 供显式 cancellation 使用。重复 `cancel()` / `dispose()` 是幂等的，并 join 同一个 quiescent teardown。

Durable Session ownership 是另一条 plane。取消 Operation 不自动 rollback v0.1 persistent authorization invariant。

## Error Boundary

第一版 public taxonomy 刻意保持 semantic，而不是 vendor-specific：

- `OperationRegistryClosedError` —— Principal teardown 开始以后不再接受新工作；
- `OperationDependencyUnavailableError` —— 执行前 required capability 缺失；
- `OperationCancelledError` —— caller / owner cancellation；
- 下游 DSH / provider error —— 保留 causal error，不为了统一错误而丢失语义。

下游失败以后仍然执行 cleanup。

## Executable Evidence

当前 contract 由下面证据持续保护：

- `packages/multi-tenant/tests/operation.test.ts` —— one-shot snapshot、missing dependency、Principal drain、幂等 teardown；
- `scripts/cordis-operation-lifecycle-probe.mjs` —— Cordis child ownership 与 reactive `inject` 行为；
- `scripts/saas-core-vertical-slice-probe.mjs` —— multi-tenant Operation 通过真实 DSH AgentRegistry create / resume / failure；
- Node 22.19 与 Node 24 GitHub Actions lanes。

因此 `A6` 已经是 `proven`，不再是 open design gate。
