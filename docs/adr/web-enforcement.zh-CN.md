[English](./web-enforcement.md) | 简体中文

# ADR — DSH Web 多租户强制（收敛版）

> 状态：**proposed（提案）**。收敛 M2（会话创生）、M3.0（准入组合）与 web Seam Map（`../specs/web-seam-map.md`）。取代早期（早于 M2/M3.0 的）web ADR。

## 背景

内核（`dsh-multi-tenant`）拥有会话所有权 + 默认拒绝式授权。问题在于：跨 DSH Web 各 surface 强制多租户所需的最小上游 seam 是什么。

## 收敛后的发现

| 关注点 | 状态 |
| --- | --- |
| **H1 — 会话创生** | **已解决（M2）** —— Agent `setup` 钩子是可见之前的异步准入点；无需内核改动。 |
| **准入组合性** | **运行时已证（M4 ②-A）** —— 装饰器可以加入 `ctx.agents.create/resume`，其准入在 `setup` 内、`sessions.enter` 之前运行；*无条件的 transport/scope 安装*仍属 ②-C。 |
| **Unary 强制** | **真实形态已实现（M4 ②-B）** —— `bindTenant` 包装真实 `ApiProxy`，`RpcMethodMap` 的每个成员都在编译期穷举分类。策略刻意默认拒绝：session point 做 guard，仅 `session.list` 做 post-filter，`session.create` 走 admission gate，未建模的 host/global 管理面一律 deny。 |
| **Streams / respond** | **待 M4 ②-C** —— 当前直接拒绝。`events` 需要 principal-bound 过滤；`respond` 需要先运行时证明 `rpcId → sessionId` 关联，再做授权。 |
| **幽灵所有权** | **v0 在安全上可接受的墓碑**（M2） —— 会话 id 必须不可复用；清理语义延后。 |

## 剩余的 transport 问题 — H3

facade 接收一个 `TenantPrincipal`，但 principal 在 **RPC 边界被丢弃**（`ConnectionRpcHandler = (endpoint, payload, signal)`）。它只存在于 transport 边界（HTTP fetch `new Request(req)`、WS 升级 `handleMux(req)`），随后 DSH 塌缩为一个共享单例（`HostConnectionService`、一个 `ApiProxy`、一个 `WebSocketDownlinks`）。目前还没有被证明可用的 per-request/per-connection principal 绑定点。

因此当前假设仍是 **H3**：真实 transport 需要一个 request/connection-scoped principal seam。M4 ②-C 必须证明这是唯一剩余的上游需求；在这个证明完成之前不提交上游提案。

## v0 Web surface 的安全策略

`RpcMethodMap` 的覆盖已经穷举，但“穷举”不等于“每个 Host 能力都适合直接暴露给租户”。在资源模型或权限模型尚未建立前，v0 采用以下规则：

- session-keyed point 操作 → **GUARD**；
- `session.list` → **FILTER**（当前语义允许正确 post-filter）；
- `session.create` → **ADMIT**，在 pre-publication admission bridge 尚未装好前由独立 facade 直接拒绝；
- `session.search` → 暂时 **DENY**，因为 DSH 返回的是全局排序、数量受限的结果集，事后过滤并不等价于 tenant-scoped query；
- deployment/host 管理面（`settings.*`、`credentials.*`、host/workspace、preset authoring、host-scoped LLM 配置/发现）→ **DENY**；
- 明确判断为 tenant-neutral 的只读发现能力可 **ALLOW**（目前为 `agentPreset.list`）。

## 当前证据明确不需要的东西

- 内核改动（H1 已通过 `setup` 解决）；
- 新的全局 setup 贡献注册表（准入装饰器已证明运行时可行；安装顺序在 ②-C 验证）。

目前不声称 `respond` 一定需要、或一定不需要专门的上游 seam。当前实现继续拒绝，直到 M4 ②-C 证明一条安全的 correlation 路径。

## 下一步

②-A（准入装饰器）和 ②-B（真实 `ApiProxy` + unary 穷举分类）已完成。M4 剩余工作是 ②-C：真实 HTTP/WS transport、principal 生命周期、mux/host 过滤、`respond` correlation，以及无遗漏的安装顺序。完成后再提交上游提案并进入完整 Web 强制。
