[English](./README.md) | 简体中文

# Docs

`dsh-multi-tenant` 当前 live architecture / release contract 导航。

## Guides

- [README](../README.zh-CN.md) —— 当前产品/Runtime 概览
- [CONTRIBUTING](../CONTRIBUTING.zh-CN.md) —— engineering / assumption-first policy
- [Direction](../ROADMAP.zh-CN.md) —— 只保留当前状态与 M5 目标，不再维护详细 milestone Roadmap

## Live Architecture

- [Architecture](./specs/architecture.zh-CN.md) —— topology 与 security boundary 权威文档
- [SaaS Boundaries](./specs/saas-boundaries.zh-CN.md) —— Product Ingress、Runtime Capability、Agent Integration planes
- [SaaS Composition](./specs/saas-composition.zh-CN.md) —— compiler、scope-local identity、provider materialization
- [RuntimeComposition](./specs/runtime-composition.zh-CN.md) —— exact Plan binding / attestation 与 product-facing lifecycle
- [M4 Product Ingress + Credentials](./specs/m4-product-ingress-credentials.zh-CN.md) —— trusted identity mapping 与 Principal credential contract
- [Principal Operation Lifecycle](./specs/operation-lifecycle.zh-CN.md) —— Principal-owned one-shot semantic work
- [Session / Agent Publication](./adr/session-genesis.zh-CN.md) —— DSH setup / publication decision

## Evidence

- [v0.3 Foundation](./specs/v0.3-foundation.zh-CN.md) —— engineering / evidence gates
- [`v0.3-assumptions.json`](./specs/v0.3-assumptions.json) —— machine-readable external assumption / proof
- [Compatibility](./reference/compatibility.zh-CN.md) —— exact DSH baseline 与 CI evidence
- [Release Contract](./reference/release.zh-CN.md) —— npm / OIDC publication contract

历史 Web / ApiProxy 和已经 superseded 的 investigation 只保留在 Git history，不继续占据 live docs。
