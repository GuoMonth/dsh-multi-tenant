[English](./README.md) | 简体中文

# 文档

`dsh-multi-tenant` 文档的导航中心。

## 指南

- [README](../README.zh-CN.md) — 项目概览
- [CONTRIBUTING](../CONTRIBUTING.zh-CN.md) — 开发方式（规格驱动 + 测试驱动）
- [ROADMAP](../ROADMAP.zh-CN.md) — 里程碑与状态

## 决策记录（ADR）

- [会话创生所有权](./adr/session-genesis.zh-CN.md) — Agent `setup` 钩子是准入点（M2）
- [Web 强制](./adr/web-enforcement.zh-CN.md) — 收敛：H3-only 上游 seam（M3）

## 规格与分析

- [架构 —— 六层](./specs/architecture.zh-CN.md) — 全局六层图
- [会话创生图](./specs/session-genesis-map.zh-CN.md) — `prepare → setup → enter → announce` 生命周期
- [准入组合](./specs/admission-composition.zh-CN.md) — 插件如何加入每一次 Agent `setup`（M3.0）
- [Web seam 图](./specs/web-seam-map.zh-CN.md) — 五个授权 surface

## 参考

- [兼容性与版本](./reference/compatibility.zh-CN.md) — Node / Cordis / DSH 范围 + pinning
- [Kernel prerelease 发布契约](./reference/release.zh-CN.md) — `0.1.0-rc.1` artifact、发布 gate、边界与 R3 checklist
