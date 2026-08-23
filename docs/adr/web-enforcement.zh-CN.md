[English](./web-enforcement.md) | 简体中文

# ADR —— Web/API Tenant Enforcement Research

> Status：**历史 enforcement 结论继续接受；旧 transport architecture 已被 v0.2 Runtime Contract / v0.3 SaaS composition 取代**。

## 继续成立的结论

早期 Web spike 确认了几条不依赖具体 transport implementation 的长期规则：

1. session-keyed point operation 在 dispatch 前必须做 ownership guard；
2. collection 只有在 post-filter 后语义仍正确时才可以 filter；
3. create / resume ownership 或 admission 必须发生在 publication 前，而不是 `session/created` 之后；
4. 没有 tenant resource model 的 deployment-global surface 继续 deny；
5. exhaustive API classification 很有价值，新 DSH method 不应该静默绕过 policy。

`packages/multi-tenant-web` 继续以 private research evidence 的形式保留真实 `ApiProxy` 实验与 compile-time exhaustive unary classification。

## 已被取代的部分

旧 ADR 把 production 推进路径理解为：先给 Web spike 增加 request/connection principal seam，再把 spike 扩成 production enforcement plane。

这已经不是当前架构方向。

v0.2 已经建立 canonical Tenant / Principal Runtime，因此 v0.3 authenticated transport 应从 Runtime structure 向外设计：

```text
wire request / connection
        ↓ authenticate explicit identity
TenantPrincipal
        ↓ resolve canonical runtime
Tenant -> Principal
        ↓ derive operation fiber
explicit Cordis inject
        ↓
DSH API / Agent operation
```

Transport 是 Runtime Contract 上方的 integration / provider layer，而不是第二套 tenant runtime。

## Boundary Ownership

Transport / security boundary 必须显式认证 identity；payload 中出现 tenant/user 字段并不意味着它们天然可信。

Identity 建立之后，canonical Principal Runtime 负责同进程 capability / lifecycle context；operation fiber 只 inject 该 request / connection / Agent action 真正需要的 service。

Persistent session ownership 仍然通过 `ctx.multiTenant`；contextual identity 永远不替代 durable authorization。

## Web Spike Code 的复用原则

以下已有能力可以在自然适配 v0.3 结构时复用：

- `ApiProxy` exhaustive method classification；
- guard / filter / deny policy mechanics；
- unknown / global surface 的 fail-closed 处理；
- 证明 cross-tenant visibility restriction 的测试。

不要为了保留旧代码增加 compatibility shim、global ambient principal state 或 parallel tenant registry。如果一个新的 v0.3 transport adapter 更简单、语义更强，就直接替换 spike。

## 当前 Evidence

- Agent / Session publication seam：[`../specs/session-genesis-map.zh-CN.md`](../specs/session-genesis-map.zh-CN.md)
- Agent setup composition：[`../specs/admission-composition.zh-CN.md`](../specs/admission-composition.zh-CN.md)
- 历史 Web seam map：[`../specs/web-seam-map.zh-CN.md`](../specs/web-seam-map.zh-CN.md)
- 当前 Runtime architecture：[`../specs/architecture.zh-CN.md`](../specs/architecture.zh-CN.md)
- 当前产品方向：[`../../ROADMAP.zh-CN.md`](../../ROADMAP.zh-CN.md)

当前精确 DSH baseline 与 executable probes 见 [`../reference/compatibility.zh-CN.md`](../reference/compatibility.zh-CN.md)。
