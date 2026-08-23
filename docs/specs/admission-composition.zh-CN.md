[English](./admission-composition.md) | 简体中文

# Agent Setup Admission —— 历史调查与当前可执行证据

本文档记录最初用于确认 DSH Agent `setup` 可以作为 before-publication composition window 的调查。它属于 historical evidence；当前 Runtime 架构权威见 [`architecture.zh-CN.md`](./architecture.zh-CN.md)。

## 历史结论

最初 source investigation 基于 DeepSeek Harness commit：

`47f943859bef60e4160492346772ded9b24f765a`

真正重要的不是某个 private helper，而是结构 contract：

```text
Agent create / resume
      ↓
caller supplies setup
      ↓
Agent factory awaits setup while unpublished
      ↓
publication / registry entry
```

因此 tenant admission 或其他 composition logic 可以在 Agent / Session 对外可见前参与，只要它通过 public Agent creation API 组合，而不是 patch private transport 或依赖 SessionStore 事后事件。

## 当前 Executable Evidence

`scripts/admission-decorator-probe.mjs` 安装当前精确 DSH baseline `0.1.1-rc.2`，并证明本项目关心的所有 genesis shape 都满足 setup-before-entry：

- create；
- fork（`parentSession`）；
- subagent（`origin: 'subagent'` + parent）；
- resume。

Probe 断言 setup callback 执行时目标 Session 尚未进入 registry，成功 publication 后才可见。

## v0.2 解释

v0.2 不再把 admission 理解成某个 Web-specific decorator 架构。更通用的结构是：

```text
canonical Principal Runtime
        ↓
derived integration fiber
        ↓ explicit inject
DSH operation / Agent create
        ↓
DSH setup publication window
```

Principal-derived operation Context 提供 identity / capability；DSH 继续拥有 Agent-local setup 与 registration scope。

这样既不需要全局 `tenantId` plumbing，也不需要第二套 Agent-specific tenancy registry。

## 当前权威

- Runtime ownership / lifecycle：[`architecture.zh-CN.md`](./architecture.zh-CN.md)
- 精确 DSH baseline 与 probes：[`../reference/compatibility.zh-CN.md`](../reference/compatibility.zh-CN.md)
- 历史 Session publication 调查：[`session-genesis-map.zh-CN.md`](./session-genesis-map.zh-CN.md)
