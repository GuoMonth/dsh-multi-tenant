[English](./admission-composition.md) | 简体中文

# M3.0 — Agent Setup 准入组合

> 关于第三方 Cordis 插件如何可靠地加入每一次 Agent `setup` 的静态证明。源码阅读于 `deepseek-ai/deepseek-harness` @ `47f943859bef60e4160492346772ded9b24f765a`。所选候选的运行时证明是 M3.1 的第一步。

## 1. 组合机制

Web surface 在 `composeAgent`（`packages/host/apiproxy/src/api-proxy.ts`）中组合 agent 的 `setup`，这是一个**私有闭包**：

```ts
async function composeAgent(presetId) {
  const presets = ctx.get('agentPresets')
  if (presets === undefined) {
    return { setup: (agentCtx) => { installSelection(agentCtx) } }
  }
  const resolvedId = (await presets.resolve(presetId)).id
  return { setup: async (agentCtx) => {
    installSelection(agentCtx)          // 模型选择（硬编码）
    await presets.mount(agentCtx, resolvedId)  // preset 组合
  } }
}
```

`presets.mount` → `mountPreset(agentCtx, preset)`（`packages/preset/agent-presets/src/mount.ts`）通过 `agentCtx.plugin(PresetTree, config)` 将 preset 的 `cordis.yml` 插件挂载进 `agentCtx`。preset service 是 `AgentPresets extends Service`（`static inject = ['loader']`）。

因此 setup 是一个**组合窗口**，但其内容固定：`installSelection` + 一个 preset 的挂载。**不存在**插件可自注册的全局 setup 贡献注册表。

## 2. 候选评估

| 候选 | 机制 | 无条件（自动）？ | 判定 |
| --- | --- | --- | --- |
| **A** 原生 preset 组合 | 将插件加入某个 preset 的 `cordis.yml` | ❌ 用户配置，非自动 | 非无条件 |
| **B** setup 贡献注册表 | 插件注册进某个注册表 | — | **不存在** |
| **C** `ctx.agents` 装饰器 | 包装 AgentService，在 `setup` 前追加准入 | ✅（若包装已安装） | **可行** |
| **D** 上游全局 setup 中间件 | DSH 增加一个贡献注册表 | ✅ | 更干净的备选 |

## 3. 候选 C 详解（可行）

插件包装 `ctx.agents`（`AgentService`）。`create`/`resume` 接收 `CreateAgentOptions` / `ResumeAgentOptions`，它们携带身份：

- `options.sessionId` —— 会话 id。
- `options.meta.parentSession` —— fork / subagent 的父级。
- `options.resumeSessionId` —— 被恢复的会话。

因此被包装的 `create` 在调用方 `setup` 前追加准入：

```ts
create(options) {
  const original = options.setup
  options.setup = async (agentCtx) => {
    await admission(options.sessionId, options.meta?.parentSession)  // 认领/继承
    return original?.(agentCtx)
  }
  return originalAgents.create(options)
}
```

各路径的身份：

| 路径 | `options` 中的身份来源 | 需要 H3？ |
| --- | --- | --- |
| create | 调用方 principal | **是**（不在 `options` 中） |
| fork / subagent | `meta.parentSession` → `getSessionOwner(parent)` | 否 |
| resume | `resumeSessionId` → 持久所有者 | 否 |

这与 M2 ADR 一致：**只有顶层 create 需要 H3**。

## 4. 结论

- setup 是一个组合窗口，但**不是一个公开 seam**：`composeAgent` 是一个私有闭包，其函数体固定为 `installSelection` + `mountPreset`。
- **C**（`ctx.agents` 装饰器）是唯一*无条件*且通过 `options` 携带身份的插件侧机制；**A** 是用户配置，**B** 不存在。
- **D**（上游全局 setup 贡献中间件）是若 M3.1 中包装 `ctx.agents` 被证明过于侵入时更干净的备选。

M3.1 的第一步是对 **C** 的运行时证明 —— 包装 `ctx.agents`，断言准入在 `sessions.enter` 之前于 `setup` 内运行，覆盖三条携带身份的路径。
