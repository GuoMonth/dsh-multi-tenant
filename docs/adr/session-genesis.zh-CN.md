[English](./session-genesis.md) | 简体中文

# ADR —— Session / Agent Publication Boundary

> Status：**已接受的 Runtime 事实**。

## Decision

DSH Agent `setup` 是 Agent 创建流程中受支持的 before-publication composition window。

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

必须在 Agent 对外可见前完成的工作，应进入这段 transaction，而不是依赖 registry publication 之后的 `session/created`。

## 当前 Evidence

Blocking CI 只重新证明现在仍然影响架构的事实：

- `scripts/session-genesis-probe.mjs` —— Session visibility / rollback 语义；
- `scripts/agent-owner-context-probe.mjs` —— Principal-derived Context 作为 caller-bound `ownerCtx` 进入 Agent creation，并保持 tenant / principal capability resolution。

早期关于全局 decorate `ctx.agents`、Web transport enforcement、静态 source map 的实验仍然保留在 Git history 中，但不再属于当前 architecture contract。

## Composition Guidance

目标结构路径：

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

SaaS Framework 自己拥有 authenticated product entry point，因此 Agent work 应自然从正确的 Principal-derived boundary 发起，而不是依赖 ambient global middleware。

## Durable Ownership Interaction

v0.1 `TenantSessionStore` ownership claim 是持久状态，与进程内 Agent lifecycle 独立。如果产品层在最终 Agent publication 前已经 reserve ownership，而之后 publication 失败，这个 durable ownership reservation 可能保留。

它不会造成 cross-tenant takeover，因为 ownership immutable，同 owner reclaim idempotent。如果 v0.3 需要 reclaim 或失败会话清理，应显式建模 reservation / finalization，而不是让 authorization state 隐式可 rollback。

## Consequences

- `session/created` 是 observation，不是 async admission；
- DSH Agent setup 与 Tenant / Principal setup 刻意共享 unpublished setup → optional commit → publication 语义；
- Principal identity / capability 来自 caller-owned Runtime boundary；
- `Agent.ctx` 继续属于 DSH Agent / Preset scope；
- persistent ownership 保持独立 defense-in-depth plane。

当前架构权威：[`../specs/architecture.zh-CN.md`](../specs/architecture.zh-CN.md)。
