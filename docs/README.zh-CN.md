[English](./README.md) | 简体中文

# 文档

`dsh-multi-tenant` 文档导航中心。

## 指南

- [README](../README.zh-CN.md) — 项目概览
- [CONTRIBUTING](../CONTRIBUTING.zh-CN.md) — 开发规范
- [ROADMAP](../ROADMAP.zh-CN.md) — 当前 release / ecosystem 方向

## 决策记录（ADR）

- [会话创生所有权](./adr/session-genesis.zh-CN.md) — Agent `setup` 准入点
- [Web 强制](./adr/web-enforcement.zh-CN.md) — H3 principal-scope 生态 seam

## 规格与分析

- [架构](./specs/architecture.zh-CN.md) — capability/layer 归属
- [会话创生图](./specs/session-genesis-map.zh-CN.md) — `prepare → setup → enter → announce`
- [准入组合](./specs/admission-composition.zh-CN.md) — plugin admission composition
- [Web seam 图](./specs/web-seam-map.zh-CN.md) — authorization surfaces

## 参考

- [兼容性与版本](./reference/compatibility.zh-CN.md) — Node / Cordis / DSH 范围 + pinning
- [Kernel prerelease 发布契约](./reference/release.zh-CN.md) — 当前 artifact、proof、OIDC 发布与边界

## Releases

- [`v0.1.0-rc.1`](./releases/v0.1.0-rc.1.md) — 第一次公开 kernel prerelease
- [`v0.1.0-rc.2`](./releases/v0.1.0-rc.2.md) — API subtraction / OIDC-only 收敛 candidate
