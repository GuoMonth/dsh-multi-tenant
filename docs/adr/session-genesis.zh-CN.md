[English](./session-genesis.md) | 简体中文

# ADR —— Session / Agent Publication Boundary

> Status：**事实已接受；实现指导已由 v0.2 Runtime Contract 更新**。

## Decision

DSH Agent `setup` 是 Agent create / resume 流程中受支持的 before-publication composition window。

关键生命周期：

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

必须在 Agent 对外可见前完成的 tenant admission 或 product composition 应进入 setup transaction，而不是依赖 Session 已进入 registry 之后的 `session/created`。

## Evidence

最初静态调查保留在 [`../specs/session-genesis-map.zh-CN.md`](../specs/session-genesis-map.zh-CN.md)。

当前 blocking CI 会在精确 DSH baseline `0.1.1-rc.2` 上重新证明：

- `scripts/session-genesis-probe.mjs`：SessionStore visibility / rollback 语义；
- `scripts/admission-decorator-probe.mjs`：create / fork / subagent / resume 的 setup-before-entry；
- `scripts/agent-owner-context-probe.mjs`：Principal-derived caller Context 作为 `ownerCtx` 进入 Agent creation。

## 更新后的 Composition Guidance

早期调查曾建议全局 wrap `ctx.agents`，让所有调用自动注入 admission logic。这个技术仍然可以作为兼容性手段和 probe，但它**不是目标 SaaS architecture**。

v0.2 / v0.3 的结构路径是：

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

SaaS Framework 自己拥有 authenticated product entry point，因此 Agent operation 应自然从正确的 Principal-derived integration boundary 发起，而不是依赖 ambient global middleware。

## Durable Ownership Interaction

v0.1 `TenantSessionStore` ownership claim 是持久状态，与进程内 Agent lifecycle 独立。如果调用方在最终 Agent publication 前已经 reserve / claim Session identity，而之后 publication 失败，这个 durable claim 可能继续作为 ownership reservation 存在。

它不会造成 cross-tenant takeover：ownership immutable，同 owner reclaim idempotent。但如果 v0.3 产品层需要回收、失败会话清理等语义，应显式建模 reservation / finalization，而不是偷偷把 immutable ownership 改成 rollbackable authorization state。

## Consequences

- `session/created` 是 observation，不是 async admission；
- DSH Agent setup 与 v0.2 Tenant / Principal setup 刻意共享 unpublished setup -> optional commit -> publication 语义；
- Principal identity / capability 来自 caller-owned Runtime boundary；`Agent.ctx` 继续属于 DSH Agent / Preset scope；
- persistent ownership 保持独立 defense-in-depth plane。

当前架构权威：[`../specs/architecture.zh-CN.md`](../specs/architecture.zh-CN.md)。
