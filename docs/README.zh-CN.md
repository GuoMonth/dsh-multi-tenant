[English](./README.md) | 简体中文

# Docs

这里是 `0.3` 产品基线的 live documentation。历史 prerelease note、过时 milestone 名称和已经 superseded 的 process / investigation 文档应该留在 Git history，而不是继续占据当前 docs tree。

## 从这里开始

- [项目 README](../README.zh-CN.md) —— 它解决什么问题、怎么安装、最短产品链路
- [Direction](../DIRECTION.zh-CN.md) —— 当前产品方向，不再维护 milestone roadmap
- [CONTRIBUTING](../CONTRIBUTING.zh-CN.md) —— engineering / evidence policy

## Product / Runtime Contracts

- [Architecture](./specs/architecture.zh-CN.md) —— topology、ownership 与 security boundary
- [Product Ingress + Credentials](./specs/product-ingress-credentials.zh-CN.md) —— trusted identity mapping 与 Principal credential capability
- [MCP Agent Integration](./specs/mcp-agent-integration.zh-CN.md) —— Tenant MCP config、Session safety 与 DSH-native Agent composition
- [RuntimeComposition](./specs/runtime-composition.zh-CN.md) —— exact Plan binding / attestation 与 product-facing lifecycle
- [Operation Lifecycle](./specs/operation-lifecycle.zh-CN.md) —— Principal-owned one-shot semantic work
- [SaaS Boundaries](./specs/saas-boundaries.zh-CN.md) —— Product Ingress、Runtime Capability、Agent Integration planes
- [SaaS Composition](./specs/saas-composition.zh-CN.md) —— compiler、scope-local identity、provider materialization

## Evidence 与 Release

- [`v0.3-assumptions.json`](./specs/v0.3-assumptions.json) —— machine-readable external assumptions / proofs
- [Compatibility](./reference/compatibility.zh-CN.md) —— pinned DSH / Cordis baseline 与 active CI evidence
- [Release Contract](./reference/release.zh-CN.md) —— npm / OIDC publication 与 registry verification
- [0.3.0-rc.1 Release Note](./releases/v0.3.0-rc.1.md) —— 当前 release candidate

## Long-term Vision

- [Authority-Oriented Capabilities](./vision/authority-capabilities.zh-CN.md) —— 从 raw credential access 往 typed authority / client capability 演进的非绑定方向

Live tree 有意不再保存 `0.1` / `0.2` release notes、旧 milestone 标签和 superseded investigation。需要考古时直接看 Git history / tag。
