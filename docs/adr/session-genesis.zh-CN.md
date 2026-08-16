[English](./session-genesis.md) | 简体中文

# ADR — 会话创生所有权

> 状态：**proposed（提案）**。基于静态的 `../specs/session-genesis-map.md` 与
> `@deepseek-ai/dsh-session@0.1.0-rc.6` 运行时探针（F1/F2）。Agent `setup` 的语义已静态确认；完整 agent 栈运行时探针被延后（`AgentLoop` 注入 `llm`/`tools`/`systemPrompt`，且源码无歧义）。

## 发现

DSH 的 Agent 工厂（`packages/core/agent-loop`、`setupAndPublish`）已经运行一个
**异步、可见之前的 `setup` 钩子**：

```
sessions.prepare(id)        # Session 已构造，但尚未入 store
await setup(agent.ctx)      # ← 异步准入点。拒绝 → dispose（回滚）。
sessions.enter(session)     # store 条目 —— get/list 现在可见
sessions.announce(session)  # session/created
```

`CreateAgentOptions.setup` / `ResumeAgentOptions.setup` 是公开的，且被全部四条创生路径（create / fork / subagent / resume）使用。

## 决策

### 1. 准入机制已存在；缺口在身份与可组合性

`setup` 是正确的准入点（在 `sessions.enter` 之前、异步、拒绝即回滚）。但它是**逐调用选项**，而非全局中间件。插件必须**包装 `ctx.agents`**（Cordis service 拦截）以将其准入注入每一次 `setup` —— 与 H3 包装 `ApiProxy` 所需的机制相同。`setup` 上下文（`agent.ctx`）暴露了 session（因此暴露了 `sessionId` 与 `meta.parentSession`），所以插件可以推导出：

| 路径 | 身份来源 | 需要 H3？ |
| --- | --- | --- |
| create | 调用方 principal | **是**（principal 不在 `setup` 中） |
| fork / subagent | 通过 `getSessionOwner(parentSession)` 得到父所有者 | 否 |
| resume | 通过持久 store 得到持久所有者 | 否 |

### 2. H1 与 H3 是不同的；只有顶层 create 将二者耦合

- **fork / subagent / resume** 今天即可通过包装 `ctx.agents` 并读取父/持久所有者来解决 —— **无需 HTTP principal**。
- **顶层 create** 仍需要调用方 principal，它在 RPC 边界被丢弃 —— 那正是 H3，不变。

### 3. 幽灵所有权是一个保留墓碑（安全），等待更严格的规则

若准入在 `setup` 内认领，而 `publish` 随后失败（例如同步 `session/created` 抛出），会话回滚但所有权认领保留。这是安全的，因为：

- 会话 id 是铸造出来的 `session-<n>` 或客户端 UUID —— 一次失败的发布绝不会授予对任何东西的访问，因此孤儿认领是一个**保留墓碑**，而非授权泄漏；
- 同所有者重试是**幂等**的；对同一 id 的不同所有者重试是冲突，这是正确的（该 id 已被保留）。

这对内存 store 与持久 store 同样成立。更严格的「保留 + 提交」语义将来可以做（C），但**不是**收口本 spike 所必需的。

## 结论

| 选项 | 判定 |
| --- | --- |
| **A** 现有 seam 已足够 | **部分** —— `setup` + 包装 `ctx.agents` 今天即可覆盖 fork/subagent/resume |
| **B** 上游 seam | **收窄** —— 仅为顶层 create 提供一个 request-scoped principal（H3），而非新的会话生命周期 |
| **C** 内核改动 | **不需要** —— 继承/恢复已可表达；幽灵所有权是安全墓碑 |

上游提案收窄为 **仅 H3**（一个抵达 create 路径的 request/connection-scoped principal）。不需要新的会话生命周期 seam。

## 下一步

- M3（web seam spike）在 **H3-only** 上游提案上推进。
- 持久 `TenantSessionStore`（M5）对跨重启 resume 仍然需要。
- 若 AgentLoop 的依赖（`llm`/`tools`/`systemPrompt`）变得容易构造 fixture，之后可以加一个完整的 `ctx.agents.create` 运行时探针。
