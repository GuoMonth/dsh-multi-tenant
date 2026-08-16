[English](./session-genesis-map.md) | 简体中文

# 会话创生图（Session Genesis Map）

> 对 DSH session + agent 生命周期的静态分析。源码阅读于
> `deepseek-ai/deepseek-harness` @ `47f943859bef60e4160492346772ded9b24f765a`
> （其 `@deepseek-ai/dsh-session` manifest 为 `0.1.0-rc.5`）。运行时探针钉住 npm 发布的 `@deepseek-ai/dsh-session@0.1.0-rc.6`；F1/F2 行为在二者间一致。

## 1. 两层：SessionStore 发布 vs. Agent 创生

底层 session store（`SessionStore`、`packages/core/session`）有一个三步发布事务：

```
prepare(id?, options)   # 构造 Session。尚未入 store。
enter(session)          # store.set(id, entry)。→ get/list/history 可见。
announce(session)       # 发出 `session/created`（同步派发）。
```

**真正的**创生路径是 agent 工厂（`packages/core/agent-loop`、`setupAndPublish`），它用一个**异步、可见之前的 `setup` 钩子**包裹该事务：

```
prepare Session           (sessions.prepare)
prepare Agent             (agent-loop prepare)
await setup(agent.ctx)    # ← 异步，先于任何 store 条目。拒绝 → 回滚。
setupCommit?.commit()
publish():
    sessions.enter(session)   # store 条目 —— get/list/history 现在可见
    agents.enter(agent)
    sessions.announce(session)  # `session/created`（同步派发）
    agents.announce(agent)
```

`CreateAgentOptions.setup` / `ResumeAgentOptions.setup` 是**公开**的，且被**全部四条**创生路径（create / fork / subagent / resume）传入。因此 DSH **确实**有一个现有的异步、可见之前的准入点 —— `setup` 钩子。

悬而未决的问题是**可组合性，而非存在性**：`setup` 是一个由调用方（`composition.setup`）提供的逐调用选项，而非全局中间件。第三方插件能否无条件地参与*每一次* setup，正是 M2.1 必须回答的。

## 2. 创生路径

| 路径 | 入口（RPC） | 所有者来源 | 经过 | 首次可见 | 回滚 |
| --- | --- | --- | --- | --- | --- |
| **create** | `session.create` | 调用方 principal —— **未被携带** | `ctx.agents.create({sessionId, meta, setup})` → `setupAndPublish` | `sessions.enter` → `list`/`get`；`announce` → `mux`/`host` | `setup` 拒绝或同步 `session/created` 抛出 → `dispose()` |
| **fork** | `session.fork` | **继承父级** | `ctx.agents.create({parentSession, seed, setup})` | 同上 | 同上 |
| **subagent** | `subagent.*` | **继承父级** | `ctx.agents.create({origin:'subagent', parentSession, setup})` | 同上 | 同上 |
| **resume** | `session.create`(预分配)/`history`/`prompt` | **恢复持久化** | `ctx.agents.resume({resumeSessionId, setup})` | 同上 | 同上 |

## 3. 钩子候选

| 候选 | 异步 | 先于 store 条目 | 可组合 | 判定 |
| --- | --- | --- | --- | --- |
| `setup`（`CreateAgentOptions.setup`） | ✅ | ✅（先于 `sessions.enter`） | ❌ 逐调用，非全局 | 正确的点；**可组合性是缺口** |
| `session/created` 监听器 | ❌ 仅同步否决 | ❌ 在 `enter` 之后 | 不适用 | 太晚 + 无异步否决 |
| 包装 `ctx.agents` | ✅（介入） | ✅ | ⚠️ 需要 principal（create）/ 父所有者（fork/subagent） | 可行但与 H3 耦合 |

## 4. 关键发现

- **F1** —— `session/created` 在 `enter` **之后**触发；事件触发时会话已对 store 可见。（运行时确认）
- **F2** —— `session/created` 是**仅同步否决**：同步抛出会回滚 `enter`，异步监听器的拒绝会被记录，而非否决。异步所有权认领无法搭它。（运行时确认）
- **F3** —— principal 在 RPC 边界被丢弃；只有**顶层 create** 需要它。fork/subagent 需要父所有者，resume 需要持久所有者 —— 二者都不需要 HTTP principal。
- **F4** —— fork/subagent 通过 `meta.parentSession` 继承。**store 契约**（`store.claim(childId, SessionOwner)`）已经表达继承；只有 `MultiTenantService.claimSession()` 辅助函数是 Principal 导向的。这是**易用性**缺口，而非能力缺口。
- **F5** —— resume 恢复持久所有者。同所有者认领是**幂等、而非冲突**；resume 必须读取持久所有权，而非重新认领。

## 5. 不变量评估

| 不变量 | 状态 |
| --- | --- |
| 1. 无所有权窗口 | ✅ `setup` 先于 `sessions.enter` 运行 —— `setup` 中的准入无窗口 |
| 2. 子级继承显式 | ⚠️ store 契约可表达（F4），但准入在钩子处需要父所有者 |
| 3. 失败时无幽灵所有权 | ✅ 保留墓碑 —— 无访问授予；同所有者重试幂等；不同所有者重试冲突（正确） |
| 4. resume 不窃取 | ✅ 同所有者幂等认领；恢复，而非重新认领 |
| 5. 并发创生唯一 | ✅ `sessionCreations` 去重 + `enter` 冲突检查 |

## 6. 结论（见 `../adr/session-genesis.md`）

`setup` 钩子是可见之前的异步准入点。可组合性通过包装 `ctx.agents`（与 H3 包装 `ApiProxy` 相同的机制）实现。Fork / subagent / resume 今天即可从父/持久所有者解决；只有顶层 create 需要 H3 的 request-scoped principal。幽灵所有权是一个安全的保留墓碑。上游提案收窄为**仅 H3**。
