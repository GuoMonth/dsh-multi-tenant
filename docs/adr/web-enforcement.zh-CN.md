[English](./web-enforcement.md) | 简体中文

# ADR — DSH Web 多租户强制（收敛版）

> 状态：**proposed（提案）**。收敛 M2（会话创生）、M3.0（准入组合）与 web Seam Map（`../specs/web-seam-map.md`）。取代早期（早于 M2/M3.0 的）web ADR。

## 背景

内核（`dsh-multi-tenant`）拥有会话所有权 + 默认拒绝式授权。问题在于：跨 DSH Web 各 surface 强制多租户所需的最小上游 seam 是什么。

## 收敛后的发现

| 关注点 | 状态 |
| --- | --- |
| **H1 — 会话创生** | **已解决（M2）** —— Agent `setup` 钩子是可见之前的异步准入点；无需内核改动。 |
| **准入组合性** | **运行时已证（M4 ②-A）** —— 插件包装 `ctx.agents`，其准入在 `setup` 内、`sessions.enter` 之前运行；*无条件* scope 安装（先于宿主自身的 `create`）仍属 ②-C。 |
| **强制 surface**（unary guard/filter、mux/host 流 filter、respond guard） | **可解决** —— 闭包绑定的 `ApiProxy` facade（PR #2 的 `bind-tenant.ts`）包装承载会话的方法与流。 |
| **幽灵所有权** | **v0 安全墓碑**（M2） —— 会话 id 必须不可复用；清理语义延后。 |

## 剩余的缺口 — H3（request-scoped principal）

facade 接收一个 `TenantPrincipal`，但 principal 在 **RPC 边界被丢弃**（`ConnectionRpcHandler = (endpoint, payload, signal)`）。它只存在于 transport 边界（HTTP fetch `new Request(req)`、WS 升级 `handleMux(req)`），随后 DSH 塌缩为一个共享单例（`HostConnectionService`、一个 `ApiProxy`、一个 `WebSocketDownlinks`）。**没有 per-connection 作用域**可供 facade 绑定。

## 决策

**最小上游 seam 仅 H3** —— 一个 request/connection-scoped principal 绑定点，它使 `ApiProxy` facade 与 `ctx.agents` 装饰器可以 **per-connection** 而非 process-wide 安装。

明确**不需要**的：

- 内核改动（H1 已通过 `setup` 解决）；
- 一个 respond 专用的 seam（facade 的 `api.respond` 包装已守卫它）；
- 一个全局 setup 贡献注册表（`ctx.agents` 装饰器已足够 —— 上游中间件只是一个更干净的备选方案）。

## 下一步

②-A（准入装饰器）已由 `scripts/admission-decorator-probe.mjs` 运行时证明。剩余 M4 工作：②-B（真实 `ApiProxy` facade + 穷举分类）与 ②-C（真实 HTTP/WS transport 原型）。然后提交 H3 上游提案（request/connection-scoped principal seam）并在此之上构建完整强制。
