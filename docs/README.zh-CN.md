[English](./README.md) | 简体中文

# Docs

这里是 **`0.3` 当前产品基线**的 live documentation，不是历史档案馆。

旧 prerelease release note、旧 milestone、已经完成的 release scope 和一次性验证 artifact 不会因为“曾经存在过”就永久留在主树；需要追溯时直接看 Git history / tag。

## 从这里开始

- [项目 README](../README.zh-CN.md) — 先看它解决什么问题、怎么安装、durable local ownership 和第一条产品链路
- [Direction](../DIRECTION.zh-CN.md) — Durable Local Experience 发布后的当前产品方向
- [CONTRIBUTING](../CONTRIBUTING.zh-CN.md) — engineering / evidence / live-tree policy

## 当前产品 / Runtime Contract

- [Architecture](./specs/architecture.zh-CN.md) — topology、ownership、安全边界
- [Product Ingress + Credentials](./specs/product-ingress-credentials.zh-CN.md) — trusted identity mapping 与 Principal credential capability
- [MCP Agent Integration](./specs/mcp-agent-integration.zh-CN.md) — Tenant MCP config、Session safety、DSH-native Agent composition
- [RuntimeComposition](./specs/runtime-composition.zh-CN.md) — exact Plan binding / attestation 与 product-facing lifecycle
- [Operation lifecycle](./specs/operation-lifecycle.zh-CN.md) — Principal-owned one-shot semantic work
- [SaaS boundaries](./specs/saas-boundaries.zh-CN.md) — Product Ingress、Runtime capability、Agent Integration planes
- [SaaS composition](./specs/saas-composition.zh-CN.md) — compiler、scope-local identity、provider materialization

## 当前产品基线

`0.3.0-rc.3 — Durable Local Experience` 保留 rc.2 已证明的真实 DSH Web 产品链路，同时让 immutable Session ownership 通过 normal DSH bundle 默认选择的 zero-external-service SQLite provider 在本地进程重启后继续存在。

SQLite 刻意定位为 local durable / single-node adoption provider。Multi-instance PostgreSQL/其他 persistence、credential lifecycle、Policy/Audit 和更多 integration 继续作为 evidence-driven follow-up。

#41 记录的 stock DSH Web request-Principal gap 是已承认 upstream boundary，不再伪装成 release blocker。Production Web 部署把 DSH 放在 Product Gateway/BFF 后面的私网，由 Gateway 先完成 authentication 和 protected resource authorization。

## Evidence 与 Release

- [`v0.3-assumptions.json`](./specs/v0.3-assumptions.json) — machine-readable external assumptions / proofs
- [Compatibility](./reference/compatibility.zh-CN.md) — pinned DSH / Cordis baseline 与当前 CI evidence
- [Release contract](./reference/release.zh-CN.md) — npm / OIDC publication 与 registry verification
- [0.3.0-rc.3 release note](./releases/v0.3.0-rc.3.md) — 当前 release candidate / 产品基线

## 长期 Vision

- [Authority-Oriented Capabilities](./vision/authority-capabilities.zh-CN.md) — 从 raw credential access 往 typed authority / client capability 演进的非绑定方向

**Live tree 只服务当前产品。历史留在 Git。**