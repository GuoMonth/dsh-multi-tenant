[English](./operation-lifecycle.md) | 简体中文

# Spec —— Principal Operation Lifecycle

> Status：P0 design contract。最终 public Operation API 被 assumption `A6` 刻意阻塞。

## 问题

SaaS request 不能从任意 root Context 直接调用 DSH。一次工作必须从一个 canonical Principal 发起，并拥有独立的 ephemeral lifecycle boundary，用来承载 dependency acquisition、cancellation、tracing 与 Agent orchestration。

目标路径：

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

## Ownership Rule

一个 Operation 只能属于一个 Principal，不能在 Principal / Tenant 之间迁移。

生命周期 ownership：

```text
Tenant owns Principal
Principal owns Operation
Operation owns operation-local resources
```

Principal dispose 完成前，所有属于它的 Operation 必须已经进入 quiescent。Cordis child fiber 的这条行为由 executable probe 证明，对应 assumption `A3`。

## Semantic State

最终命名现在不冻结，但 P0 使用下面状态机推理：

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

Required capability acquisition 和 operation setup 成功之前，consumer 不能观察到 ACTIVE Operation。

## One-shot Work 与 Reactive Injection

Cordis `ctx.inject()` 是 reactive plugin primitive。仓库 probe 会证明：required service 消失时 callback unload；service 重新出现后 callback 可以再次执行，对应 assumption `A4`。

因此，下面这段代码**不能**直接被定义为“一次用户 Operation”的语义：

```ts
principal.ctx.inject(['agents'], async (ctx) => {
  await performExternallyVisibleUserWork(ctx)
})
```

除非 Operation abstraction 能证明 dependency churn 下 exactly-once / idempotent 行为。

P0 在冻结 public API 前必须显式选择并证明更安全的模型。候选方案可以是 one-shot acquisition 后显式拥有 lifetime，或者通过 idempotent transaction token 拒绝 callback re-entry；这个 foundation Spec 不提前选择实现。

这个尚未解决的设计点就是 assumption / gate `A6`。

## Agent Boundary

当 Operation 在一次 attempt 生命周期内拥有稳定的 Principal-derived Context 后，Agent creation 使用已经验证的 seam：

```text
Operation Context
   ↓ caller-bound ownerCtx
ctx.agents.create / resume
   ↓
DSH Agent setup transaction
   ↓
DSH publication
```

Operation 不复制 Cordis 私有 isolation map 到 `Agent.ctx`，也不创建平行的 Agent tenant registry。

## Cancellation

P0 至少要求一个 cancellation direction 从结构上成立：

```text
Principal disposal
    ↓
Operation cancellation / teardown
```

Operation-local cancellation 也必须 dispose Operation 自己拥有的资源。具体 AbortSignal / public API shape 不在这个 foundation PR 冻结。

Cancellation 不自动等于 durable authorization rollback。v0.1 ownership kernel 是 immutable + persistent，Session ownership reservation / finalization 仍然是独立产品语义。

## Failure Semantics

Operation failure 至少需要在概念上区分：

- composition / dependency 无法获得；
- caller cancellation；
- Agent setup / publication failure；
- Agent execution failure；
- teardown failure。

Framework 应保留 causal error 信息，同时仍然尝试 quiescent cleanup。最终 public error class 等 behavior test 存在以后再冻结。

## Public API 前必须具备的 P0 Tests

第一版 Operation implementation 必须证明：

1. Operation 结构上绑定到一个 Principal；
2. Tenant A/B 和 Principal sibling capability state 不串；
3. Principal dispose 会 drain ACTIVE / PREPARING Operation；
4. Operation-local resource exactly-once cleanup；
5. dependency churn 不能重复产生外部可见工作；
6. create / resume 使用正确 Principal-derived DSH owner context；
7. Agent publication failure 不留下 live partial Operation / Agent graph；
8. 重复 dispose / cancel 幂等且 quiescent。

第 5 条没有证明以前，Operation public API 保持 gated。
