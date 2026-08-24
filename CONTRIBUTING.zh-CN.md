[English](./CONTRIBUTING.md) | 简体中文

# Contributing

本仓库优先 **当前结构正确性 + prerelease 快速迭代**，不优先兼容旧 milestone 形态。

## 从 live product model 开始

```text
Product authentication
  -> trusted Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> typed Runtime capabilities
  -> one-shot Operation
  -> Principal-owned DSH Agent
  -> native DSH integrations
```

改代码前先回答：

1. 这个 identity / state / resource 到底归谁拥有？
2. 谁负责 create、publish、cancel、teardown？
3. Cordis / DSH 是否已经能表达这个 dependency / registration boundary？
4. 哪些非法状态应该从结构上不可表达？
5. 什么 executable evidence 能证明它？
6. 这个东西现在还服务 `0.3` 产品方向吗？

如果一个设计需要不断加例外，先重审 data model，不要先加 compatibility glue。

## Boundary Rule

- **我们控制 -> 严格 enforce。** 必要时 fail closed，并用 test 固化。
- **生态控制 -> 证明 / 标准化最小 seam。** Pin external baseline，并维护 executable compatibility evidence。
- **无法 enforce -> 明确 boundary。** 不用本地 fork、平行 registry 掩盖现实。

## 当前 Structural Rules

- Product authentication 在 Core 之外；Ingress 从已经可信的 subject 开始。
- Tenant / Principal 是 canonical lifecycle identity，Principal 结构性属于 Tenant。
- `CapabilityToken<T, Scope>` 绑定 semantic key、type 与 authority / lifecycle scope。
- Cordis 是唯一 DI / service / lifecycle substrate；不要造第二个 container。
- `RuntimeComposition` 绑定一张精确 product plan，阻止静默 plan mixing。
- Operation 是 non-reactive one-shot semantic work，只 capture 一次 required capability。
- Long-lived DSH Agent 属于 Principal，而不是一次短生命周期 create/resume Operation。
- Session ownership fail closed；未授权 resume 在 DSH work 前拒绝。
- Agent Integration 使用 DSH-native seam；不要再造第二套 Agent / MCP registry。
- hostile-code strong isolation 属于 process / container / Pod / sidecar / remote boundary。

只有新的 executable evidence 明确证明全局结构应该改变时，才做 deliberate prerelease redesign。

## External Compatibility

当前精确 DSH baseline：

- version：`0.1.1-rc.2`
- release commit：`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

`scripts/dsh-target.mjs` 是权威 source。Baseline refresh 必须显式：更新 pin，跑当前 source / platform / artifact proof，从结构上修失败，再同步 live docs。

详见 `docs/reference/compatibility.zh-CN.md`。

## Evidence Policy

`docs/specs/v0.3-assumptions.json` 记录 blocking external assumption。Public contract 不能依赖尚未证明的 blocking assumption。

按问题使用最小但真实的 proof：

- repository-owned semantics -> unit / contract test；
- DSH / Cordis external behavior -> compatibility probe；
- protocol / Agent seam -> real integration probe；
- npm 用户真正安装的东西 -> installed-artifact smoke。

读 upstream source 适合形成 hypothesis，但不是 release proof。

## Vision 不是 Contract

`docs/vision/*` 只记录长期方向，不提前批准 package name 或 public API。

当前 authority vision 更偏向 typed ability，而不是永久暴露 raw credential。Public Broker contract 必须由多个真实 integration 反复出现的共同语义挣出来。

## Package Rule

只有出现真实 independent consumer / replacement / lifecycle / versioning boundary 才拆 package。

不要提前 scaffold Auth、Broker、ERP、MCP、Transport package family。Research 与一次性 evidence 放 focused test / script / docs，或者直接交给 Git history。

## Definition of Done

一个变更完成，至少要满足：

- ownership / lifecycle / type 结构一致；
- 服务当前产品方向；
- current spec / docs 对齐；
- required external assumptions 有 executable proof 并全绿；
- `pnpm release:check` 全绿；
- 没有新增 obsolete compatibility shim、milestone scaffold 或重复 protocol / registry。

历史 prerelease 文档与 superseded investigation 属于 Git history，不属于 live tree。
