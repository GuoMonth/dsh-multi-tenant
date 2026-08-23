[English](./README.md) | 简体中文

# dsh-multi-tenant-web

私有的 DSH Web / ApiProxy research package。

这个 package **不是当前 production layer，也不是 release artifact**。它保留有价值的 enforcement 实验与 DSH API surface 编译期证据；v0.3 会基于 canonical Tenant / Principal Runtime Contract 重新设计 authenticated transport。

`private: true` 是刻意的。

## 当前作用

这个 package 仍然证明了一些有价值的事实：

- 真实 DSH `ApiProxy` facade 可以做 compile-time exhaustive classification；
- session-keyed operation 可以 guard / fail closed；
- collection filtering 必须保持 endpoint 语义，不能简单删除 foreign row；
- 未建模 / global surface 在没有明确 tenant 语义前应该继续 deny。

它的 DSH-facing dependency 固定到仓库统一 baseline `0.1.1-rc.2`，并由 `pnpm verify` 强制检查。

## 本 Package 不定义什么

旧 spike 不再定义 v0.3 transport architecture。Production transport 不应该变成另一套全局 `tenantId` plumbing，也不应该为了兼容旧 request model 反向污染 Runtime。

v0.3 的目标结构是：

```text
HTTP / WebSocket / other wire boundary
        ↓ authenticate
TenantPrincipal
        ↓ resolve canonical runtime
Tenant -> Principal
        ↓ derive operation fiber
explicit inject of transport / agents / providers
        ↓
DSH operation
```

Wire / security boundary 保持 explicit identity；之后 capability 与 lifecycle context 通过 canonical Principal Runtime 与 derived integration fiber 自然传播。

## Reuse Policy

v0.3 只有在旧代码 / 结论能自然适配新结构时才复用。如果旧 spike 需要 compatibility shim、parallel registry 或 transport-specific exception 才能接入 Runtime Contract，应优先干净重构或替换。

历史 Web seam 分析继续保存在：

- [`docs/adr/web-enforcement.zh-CN.md`](../../docs/adr/web-enforcement.zh-CN.md)
- [`docs/specs/web-seam-map.zh-CN.md`](../../docs/specs/web-seam-map.zh-CN.md)

这些文档属于早期 investigation evidence，不是当前 architecture authority。当前架构见 [`docs/specs/architecture.zh-CN.md`](../../docs/specs/architecture.zh-CN.md)，下一阶段产品方向见 [`ROADMAP.zh-CN.md`](../../ROADMAP.zh-CN.md)。
