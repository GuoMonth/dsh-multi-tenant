[English](./CONTRIBUTING.md) | 简体中文

# Contributing

`dsh-multi-tenant` 处于快速 prerelease 阶段。贡献优先服务于 **当前产品正确性、可执行证据和精简 live tree**，而不是维护历史形状。

## 产品与架构规则

当前产品链路是：

```text
trusted product subject
  -> Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native MCP Tools
```

新增 abstraction、package、compatibility layer 之前，先问：真实 vertical slice 是否已经需要它？

> **不要因为一个名字听起来可复用就创造架构；让多个真实 integration 去挣出 abstraction。**

项目继续遵守这条边界原则：

> **控制得住的地方严格强制；需要生态协作的地方制定标准；控制不住的地方明确边界。**

## Evidence before abstraction

Public API 依赖的 blocking external assumption，必须先有 executable evidence。

优先顺序：

```text
product requirement
  -> explicit boundary / assumption
  -> executable probe or contract test
  -> public API
  -> documentation
```

阅读 upstream source 可以解释为什么行为存在，但 release-critical 行为不能只靠读代码猜，必须有 probe / contract test。

当前外部 assumptions 记录在 `docs/specs/v0.3-assumptions.json`。

## Cordis / DSH first

优先使用 DSH / Cordis 原生 seam：

- Context / Fiber 管 ownership 和 lifecycle；
- Cordis service 管 capability；
- DSH Agent scope 管 Agent-local behavior；
- 官方 DSH MCP client / ToolRuntime 管 MCP Tools。

不要为了 abstraction 看起来更整齐，引入第二套 DI container、平行 lifecycle system 或自造 MCP protocol stack。

## Live Tree Policy

当前仓库**不是档案馆**。

应该保留：

- 当前代码；
- 当前 product / Runtime contract；
- 当前 executable evidence；
- 当前 release machinery；
- 仍然影响架构判断的 non-binding Vision。

应该删除或合并：

- 已经被替代的 milestone 文档 / 命名；
- 项目进入新 active baseline 后的旧 prerelease release note；
- 结论已经被 permanent test 吸收的一次性调查 workflow；
- 已经被更强 end-to-end proof 覆盖的重复 probe；
- 当前 release contract 不再需要的 compatibility scaffolding。

历史价值交给 Git history / tag，不要让当前主树永久为 archaeology 付维护成本。

## Vision 不是 Contract

长期方向可以放在 `docs/vision/*`，但 Vision 不创建 release gate，也不能提前批准 package name / public API。

当前 authority-capability Vision 长期偏向让 Operation 消费 typed ability，而不是直接拿 raw credential。未来 Broker 可以成为 replaceable plugin capability，service integration 可以提供 typed client / transport，但必须等多个真实 integration 证明共同 contract 后再固化。

## 变更检查

重要变更合并前至少确认：

- 产品价值明确；
- ownership / lifecycle boundary 明确；
- 受影响 public contract / docs 已更新；
- release-critical external assumption 有 executable evidence；
- 相关 Node 22.19 / Node 24 gate 全绿；
- package-facing change 验证的是 packed artifact，而不只是 workspace source；
- 临时调查基建已经删除，或升级为当前 permanent proof；
- 没有重新引入退休 milestone artifact。

## Release Change

`packages/multi-tenant/package.json` 是 release identity 的唯一 source of truth。保留的 release workflow 从 `main` 通过 npm Trusted Publishing / OIDC 发布，然后验证 exact registry artifact。

不要为 speculative future package 创建 release machinery；只有真正独立可发布 boundary 出现时才增加。
