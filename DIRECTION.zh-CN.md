[English](./DIRECTION.md) | 简体中文

# Direction

`0.3` 是当前产品基线。项目不会维护长篇 milestone roadmap，也不会因为某个 prerelease / 调查文档“曾经存在过”就把它永久留在 live tree。

## 当前基线

`0.3.0-rc.1` 已经发布，并且证明了当前 Core 产品链路：

```text
trusted product subject
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> safe create/resume
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native MCP Tools
```

Runtime correctness 已经不再是当前最高优先级 Gap。下一个真正的瓶颈是 **Time to First Value**：一个本来就有 Web 登录身份的产品开发者，能不能不先成为框架专家，就快速感受到 Multi-Tenant DSH 的价值？

## 下个版本：0.3.0-rc.2 — First Product Experience

下个版本明确以产品体验为中心，而不是继续推进架构 milestone。

P0 目标链路：

```text
已有 JWT / Cookie / req.user
        ↓
TrustedSubject
        ↓
Tenant / Principal
        ↓
DSH Web + Principal-bound Agent
        ↓
真实 MCP Tool
        ↓
肉眼可见的 identity / Session 隔离
```

范围故意收窄到四件事：

1. 一个使用真实 DSH + 真实 MCP 的可运行 DSH Web SaaS Starter；
2. 薄 JWT 与 Cookie/session identity bridge 示例；
3. 在现有 Core 之上的更短 opinionated product-facing happy path；
4. 不泄露 secret 的、可操作 first-use diagnostics。

成功标准是：第一次接触项目的开发者只看 README / Starter，30 分钟以内完成真实 MCP Tool 调用，并且能够直接看到 owner 正常访问与 cross-Principal Session 被拒绝这两个结果。

完整冻结范围与明确 Non-goals 见 [`docs/scopes/v0.3.0-rc.2.zh-CN.md`](./docs/scopes/v0.3.0-rc.2.zh-CN.md)。

## 不阻塞 rc.2 的后续能力

以下能力仍然重要，但不能阻塞 First Product Experience：

- production Redis / SQL Session Store；
- 通用 Broker / `Capability-as-Authority` contract；
- generic OAuth / OIDC / token refresh framework；
- Permission / Policy Plugin；
- 完整 Audit / OTel 产品；
- 第二个 ERP / direct-business-API integration；
- hostile-code strong isolation。

只有真实产品使用证明其中某项是 P0 闭环的必要条件时，才允许把它提前拉进来，而且只补最小 seam。

## Live Tree Policy

- 当前代码、当前 contract、当前 evidence 留在主树；
- 已经被替代的 milestone 名称、旧 release note、一次性 probe / workflow 删除；
- 历史价值交给 Git history / tag，不让 archaeology 增加当前维护成本；
- package / abstraction 只有在真实 vertical slice 证明独立价值后才新增；
- 当前 release scope 文档只是 live artifact，版本发布后历史重新交给 Git。

## 长期原则

> **Core 管 identity / lifecycle；Broker 管 authority / secret；Integration 管 vendor protocol；Operation 消费 typed ability；Secret 在可行时留在 authority boundary 后面。**

这个长期方向仍然有效，但 `0.3.0-rc.2` 不以抽取 Broker abstraction 为阻塞条件。

详见 [`docs/vision/authority-capabilities.zh-CN.md`](./docs/vision/authority-capabilities.zh-CN.md)。