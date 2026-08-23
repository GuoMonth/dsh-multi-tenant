[English](./session-genesis-map.md) | 简体中文

# Session Genesis —— 历史调查与当前可执行证据

本文档记录最初用于确认 DSH Session / Agent publication seam 的调查过程。它属于 evidence，不是当前 Multi-Tenant Runtime 的架构权威；当前 Runtime Contract 见 [`architecture.zh-CN.md`](./architecture.zh-CN.md)。

## 历史 Source Investigation

最初静态分析基于 DeepSeek Harness commit：

`47f943859bef60e4160492346772ded9b24f765a`

当时确认了两个不同的 publication layer。

### Low-level SessionStore

```text
prepare(session)     unpublished
      ↓
enter(session)       registry-visible
      ↓
announce(session)    session/created dispatch
```

因此 `session/created` 不是 before-visibility admission point。

### Agent Factory Genesis

Agent factory 在 publication 前增加了 async setup window：

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

真正有价值的是这个 setup composition boundary：setup 失败时 Session / Agent 仍未对外可见，可以完整 rollback。

## 当前 Executable Evidence

仓库不再把历史 source read 当成当前兼容性证明。`scripts/session-genesis-probe.mjs` 会在干净临时 consumer 中安装 `scripts/dsh-target.mjs` 指定的精确 DSH baseline（当前 `0.1.1-rc.2`），并断言：

1. `session/created` 执行时 Session 已经进入 store；
2. 同步 `session/created` throw 会 rollback publication；
3. async listener rejection 无法否决已经完成的同步 publication boundary。

`scripts/admission-decorator-probe.mjs` 另行证明 create / fork / subagent / resume 四条路径的 Agent setup 都发生在 `sessions.enter` 之前。

这些 probe 在 Node 22.19 与 Node 24 上都是 blocking CI。

## 对当前架构的影响

v0.2 对 Tenant / Principal Runtime node 使用相同 publication 原则：

```text
prepare unpublished subtree
      ↓
await setup(signal)
      ↓
optional synchronous commit()
      ↓
publish canonical node
```

这是刻意与 DSH 生命周期语义保持一致，而不是另造一套平行 transaction model。

当前 DSH baseline 与 evidence policy 见 [`../reference/compatibility.zh-CN.md`](../reference/compatibility.zh-CN.md)。
