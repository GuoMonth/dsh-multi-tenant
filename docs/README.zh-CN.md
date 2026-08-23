[English](./README.md) | 简体中文

# 文档

`dsh-multi-tenant` 当前 live architecture 与 release contract 的导航中心。

## 指南

- [README](../README.zh-CN.md) — 项目概览与当前 Runtime Contract
- [CONTRIBUTING](../CONTRIBUTING.zh-CN.md) — 工程与兼容性规范
- [ROADMAP](../ROADMAP.zh-CN.md) — v0.2 基础与 v0.3 SaaS Framework 方向

## 当前架构

- [架构](./specs/architecture.zh-CN.md) — canonical Tenant / Principal Runtime 模型
- [Session / Agent Publication Boundary](./adr/session-genesis.zh-CN.md) — 当前 DSH setup / publication 决策

## 参考

- [兼容性与版本](./reference/compatibility.zh-CN.md) — 精确 DSH baseline 与当前 CI evidence
- [发布契约](./reference/release.zh-CN.md) — package version 单一事实源、npm latest、OIDC publication 与 registry proof

历史 Web/ApiProxy、admission-decorator 与早期静态调查文档刻意留在 Git history，而不是继续占据 live documentation tree。

## Releases

- [`v0.2.0-rc.3`](./releases/v0.2.0-rc.3.md) — 已发布 v0.2 Runtime Contract
- [`v0.2.0-rc.2`](./releases/v0.2.0-rc.2.md) — canonical Runtime Contract 收敛
- [`v0.2.0-rc.1`](./releases/v0.2.0-rc.1.md) — 第一个 context-native v0.2 runtime candidate
- [`v0.1.0-rc.2`](./releases/v0.1.0-rc.2.md) — 冻结 kernel API 收敛
- [`v0.1.0-rc.1`](./releases/v0.1.0-rc.1.md) — 第一次公开 kernel prerelease
