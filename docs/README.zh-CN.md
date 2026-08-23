[English](./README.md) | 简体中文

# 文档

`dsh-multi-tenant` 文档导航中心。

## 指南

- [README](../README.zh-CN.md) — 项目概览与当前 Runtime Contract
- [CONTRIBUTING](../CONTRIBUTING.zh-CN.md) — 工程与兼容性规范
- [ROADMAP](../ROADMAP.zh-CN.md) — v0.2 收口与 v0.3 SaaS Framework 方向

## 决策记录（ADR）

- [会话创生所有权](./adr/session-genesis.zh-CN.md) — Agent `setup` 准入点
- [Web 强制](./adr/web-enforcement.zh-CN.md) — H3 principal-scope 生态 seam

## 规格与分析

- [架构](./specs/architecture.zh-CN.md) — capability/layer 归属
- [会话创生图](./specs/session-genesis-map.zh-CN.md) — `prepare -> setup -> enter -> announce`
- [准入组合](./specs/admission-composition.zh-CN.md) — plugin admission composition
- [Web seam 图](./specs/web-seam-map.zh-CN.md) — authorization surfaces

## 参考

- [兼容性与版本](./reference/compatibility.zh-CN.md) — 精确 DSH baseline 与 CI evidence
- [发布契约](./reference/release.zh-CN.md) — package version 单一事实源、npm latest、OIDC publication 与 registry proof

## Releases

- [`v0.2.0-rc.3`](./releases/v0.2.0-rc.3.md) — v0.2 最终收口 candidate
- [`v0.2.0-rc.2`](./releases/v0.2.0-rc.2.md) — canonical Runtime Contract 收敛
- [`v0.2.0-rc.1`](./releases/v0.2.0-rc.1.md) — 第一个 context-native v0.2 runtime candidate
- [`v0.1.0-rc.2`](./releases/v0.1.0-rc.2.md) — 冻结 kernel API 收敛
- [`v0.1.0-rc.1`](./releases/v0.1.0-rc.1.md) — 第一次公开 kernel prerelease
