[English](./web-seam-map.md) | 简体中文

# DSH Web Multi-Tenant Seam Map —— 历史研究

本文档保留早期 Web/API authorization 调查。它**不是当前 transport architecture authority**。v0.3 transport design 应从 [`architecture.zh-CN.md`](./architecture.zh-CN.md) 中的 canonical Tenant / Principal Runtime Contract 出发。

## 历史 Source

最初 seam map 基于 DeepSeek Harness commit：

`47f943859bef60e4160492346772ded9b24f765a`

它确认了几类仍有价值的 enforcement idea：

| Surface Shape | 可复用 Enforcement Idea |
| --- | --- |
| Session-keyed point RPC | dispatch 前 guard ownership。 |
| Collection RPC | 只有 post-filter 后语义仍正确时才 filter。 |
| Create / resume | 通过 Agent setup 在 publication 前 admit。 |
| Streams / respond / global surface | 没有明确 tenant resource / correlation model 前继续 deny。 |

这些结论仍有参考价值，但旧 spike 的 transport model 已经不再是目标架构。

## 当前架构变化

v0.2 引入 canonical runtime hierarchy：

```text
Tenant -> Principal -> derived integration fiber -> DSH operation
```

未来 authenticated transport 应该形成：

```text
HTTP / WebSocket / other wire boundary
        ↓ authenticate explicit identity
TenantPrincipal
        ↓ resolve canonical Tenant / Principal
Principal Runtime
        ↓ derive operation fiber + explicit inject
DSH API / Agent operation
```

Transport identity 在 security boundary 保持 explicit；capability / lifecycle scope 来自 canonical Principal Runtime。这比把 `tenantId` 参数扩散到所有下游 API，或保留 Web-specific tenant registry 更自然。

## 旧 Web Package 的当前定位

`packages/multi-tenant-web` 继续保持 private，用于保留：

- 真实 `ApiProxy` 实验；
- DSH unary API exhaustive classification；
- fail-closed guard / filter / deny 研究。

它是 research / compatibility package，不是 production v0.3 framework layer。只有旧代码能自然适配当前 Runtime Contract、不需要 compatibility shim 或 parallel state 时才复用。

## 当前 Evidence

原 seam map 中 admission-before-publication 的核心结论，现在已经通过 `scripts/admission-decorator-probe.mjs` 在精确 DSH baseline `0.1.1-rc.2` 上成为 blocking CI evidence。

当前 DSH compatibility policy：[`../reference/compatibility.zh-CN.md`](../reference/compatibility.zh-CN.md)。
当前产品方向：[`../../ROADMAP.zh-CN.md`](../../ROADMAP.zh-CN.md)。
