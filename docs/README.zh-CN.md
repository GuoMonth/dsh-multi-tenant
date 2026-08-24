[English](./README.md) | 简体中文

# Docs

这里是 **`0.3` 当前产品基线**的 live documentation，不是历史档案馆。

旧 prerelease release note、旧 milestone 名称、已经被替代的调查文档和一次性验证脚本不会因为“曾经存在过”就继续留在主树里；需要追溯时直接看 Git history / tag。

## 从这里开始

- [项目 README](../README.zh-CN.md) — 先看它解决什么问题、怎么安装、怎么跑第一条产品链路
- [Direction](../DIRECTION.zh-CN.md) — 当前方向，不维护长篇 milestone roadmap
- [CONTRIBUTING](../CONTRIBUTING.zh-CN.md) — engineering / evidence policy

## 当前产品 / Runtime Contract

- [Architecture](./specs/architecture.zh-CN.md) — topology、ownership、安全边界
- [Product Ingress + Credentials](./specs/product-ingress-credentials.zh-CN.md) — trusted identity mapping 与 Principal credential capability
- [MCP Agent Integration](./specs/mcp-agent-integration.zh-CN.md) — Tenant MCP config、Session safety、DSH-native Agent composition
- [RuntimeComposition](./specs/runtime-composition.zh-CN.md) — exact Plan binding / attestation 与 product-facing lifecycle
- [Operation lifecycle](./specs/operation-lifecycle.zh-CN.md) — Principal-owned one-shot semantic work
- [SaaS boundaries](./specs/saas-boundaries.zh-CN.md) — Product Ingress、Runtime capability、Agent Integration planes
- [SaaS composition](./specs/saas-composition.zh-CN.md) — compiler、scope-local identity、provider materialization

## Evidence 与 Release

- [`v0.3-assumptions.json`](./specs/v0.3-assumptions.json) — machine-readable external assumptions / proofs
- [Compatibility](./reference/compatibility.zh-CN.md) — pinned DSH / Cordis baseline 与当前 CI evidence
- [Release contract](./reference/release.zh-CN.md) — npm / OIDC publication 与 registry verification
- [0.3.0-rc.1 release note](./releases/v0.3.0-rc.1.md) — 当前 release candidate

## 长期 Vision

- [Authority-Oriented Capabilities](./vision/authority-capabilities.zh-CN.md) — 从 raw credential access 往 typed authority / client capability 演进的非绑定方向

**Live tree 只服务当前产品。历史留在 Git。**
