[English](./README.md) | 简体中文

# Docs

`dsh-multi-tenant` 当前 live architecture / release contract 导航。

## Guides

- [README](../README.zh-CN.md) —— 当前产品/Runtime 概览
- [CONTRIBUTING](../CONTRIBUTING.zh-CN.md) —— engineering / assumption-first policy
- [Direction](../ROADMAP.zh-CN.md) —— 当前 M5 焦点 + 长期演进方向，不再维护详细 milestone Roadmap

## Live Architecture

下面这些文档描述**已经实现或当前 release line 依赖的 contract**：

- [Architecture](./specs/architecture.zh-CN.md) —— topology 与 security boundary 权威文档
- [SaaS Boundaries](./specs/saas-boundaries.zh-CN.md) —— Product Ingress、Runtime Capability、Agent Integration planes
- [SaaS Composition](./specs/saas-composition.zh-CN.md) —— compiler、scope-local identity、provider materialization
- [RuntimeComposition](./specs/runtime-composition.zh-CN.md) —— exact Plan binding / attestation 与 product-facing lifecycle
- [M4 Product Ingress + Credentials](./specs/m4-product-ingress-credentials.zh-CN.md) —— trusted identity mapping 与 Principal credential contract
- [Principal Operation Lifecycle](./specs/operation-lifecycle.zh-CN.md) —— Principal-owned one-shot semantic work
- [Session / Agent Publication](./adr/session-genesis.zh-CN.md) —— DSH setup / publication decision

## Long-term Vision

Vision 记录方向，**不是当前 API contract，也不进入 release gate**：

- [Authority-Oriented Capabilities](./vision/authority-capabilities.zh-CN.md) —— 从 `Credential-as-Data` 演进到 `Capability-as-Authority`；Broker / Integration plugin 的长期职责拆分，以及为什么当前仍先用 M4 primitive 完成 M5。

## Evidence

- [v0.3 Foundation](./specs/v0.3-foundation.zh-CN.md) —— engineering / evidence gates
- [`v0.3-assumptions.json`](./specs/v0.3-assumptions.json) —— machine-readable external assumption / proof
- [Compatibility](./reference/compatibility.zh-CN.md) —— exact DSH baseline 与 CI evidence
- [Release Contract](./reference/release.zh-CN.md) —— npm / OIDC publication contract

历史 Web / ApiProxy 和已经 superseded 的 investigation 只保留在 Git history，不继续占据 live docs。
