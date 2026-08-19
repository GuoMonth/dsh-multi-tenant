[English](./web-enforcement.md) | 简体中文

# ADR — DSH Web 多租户强制（发布收敛版）

> 状态：**proposed（提案）**。收敛 session genesis、admission composition、真实 `ApiProxy` 以及 RC7 transport 证据。本文档现在明确遵循项目边界原则：本仓库控制得住的 enforcement 自己实现；DSH transport 缺少的 scope 作为生态 seam 处理，而不是 fork carrier。

## 背景

内核（`dsh-multi-tenant`）拥有 session ownership 和 fail-closed authorization。Web 问题更窄：需要 DSH 提供什么最小 seam，才能把一个已认证的 request/connection identity 带入本仓库拥有的 enforcement，同时不依赖共享 ambient state。

## 收敛后的结论

| 关注点 | 状态 |
| --- | --- |
| **H1 — session genesis** | **已解决。** Agent `setup` 是 visibility 前的异步准入点；不需要 kernel 改动。 |
| **Admission composability** | **RC6 runtime 已证明；RC7 refresh 属于发布兼容性工作。** decorator 可以加入 `ctx.agents.create/resume`，且 admission 在 `sessions.enter` 前执行。 |
| **Unary enforcement** | **真实形态已实现。** `bindTenant` 包装真实 `ApiProxy`；`RpcMethodMap` 每个成员都被穷举分类，策略默认拒绝。 |
| **H3 — request/connection principal scope** | **RC7 生态缺口。** 公开的 `ConnectionRpcHandler` 只有解码后的 `(endpoint, payload, signal)`；真实 HTTP/WS boundary 由 DSH Web carrier 持有，而且官方文档明确说明目前没有 authentication layer。 |
| **Streams / respond** | **在 H3 之后处理。** spike 中继续拒绝。只有真实 principal-scoped transport path 存在后才实现。 |
| **Ghost ownership** | **v0 在安全上可接受的 tombstone。** Session id 不可复用；cleanup semantics 是独立后续工作。 |

## RC7 下的 H3 —— 生态交付物

facade 需要一个 `TenantPrincipal`，但 RC7 的公开 Connection RPC seam 在 decoded handler 执行时已经拿不到 transport request。真实 HTTP request / WS upgrade 保留在 DSH Web carrier 内部；官方 carrier 也明确把现有 host fence 定义为 reachability policy，而不是 authentication。

这些证据已经足够把 H3 归类为**生态拥有**。本项目不应该为了让本地 checklist 看起来完整，就长期构建并维护一套 DSH Web transport 替代实现。

真正应该交付的是一个**最小、tenant-agnostic 的 upstream seam**：让 consumer 可以基于真实 HTTP request / WS upgrade 建立或安装 request/connection-scoped API/security context。proposal 应保留 DSH 对 carrier 的所有权，并尽量让这个 seam 对其他插件也有价值。

为了打磨 API proposal，可以继续写一个很小的 local probe；但完整 HTTP/WS transport clone 不再是 kernel release 的前置条件，也不再是提交 upstream proposal 的前置条件。

## v0 Web spike 的安全策略

`RpcMethodMap` 已经穷举，但穷举并不等于 host-global capability 就具备 tenant-safe 语义。真实 resource semantics 和 H3 存在之前，spike 继续 fail-closed：

- session-keyed point 操作 → **GUARD**；
- `session.list` → 只有在 post-filter 保持语义正确时才 **FILTER**；
- `session.create` → **ADMIT**，在 principal-scoped admission 能够 publication 前安装之前继续拒绝；
- `session.search` → 当前 **DENY**；tenant-scoped ranking/visibility 属于后续 search contract；
- deployment/host 管理面（`settings.*`、`credentials.*`、host/workspace、preset authoring、host-scoped LLM 配置/发现）→ **DENY**；
- 明确 tenant-neutral 的只读 discovery 可以 **ALLOW**；
- streams、`respond`、downloads 在支持的安全语义真正实现前继续 **DENY**。

## 明确不需要的东西

当前证据**不**要求：

- kernel 改动；
- 新的全局 setup contribution registry；
- 永久 fork 或重写 DSH Web transport；
- 把 JWT/OIDC/API-key 逻辑塞进 kernel；
- 在 v0.1 中把 DSH host-global resource 强行变成 tenant-owned。

principal-scoped connection path 存在以后，`respond` 可能需要 correlation state。那是届时要验证的 enforcement detail，不是现在提前扩大 upstream proposal 的理由。

## 下一步

1. **发布主线：** 对 RC7 刷新受影响的 admission/ApiProxy evidence；这已经足够形成 kernel compatibility baseline。
2. **生态主线：** 提交小型 request/connection-scope upstream proposal，并附带并发隔离与 HTTP/WS lifetime 的 conformance expectation。
3. **足够 seam 存在以后：** 再把 `dsh-multi-tenant-web` 变成 production plugin，并通过 two-tenant E2E 一起证明 unary/admission/mux/host/respond。

Production Web enforcement 不再阻塞第一次 `dsh-multi-tenant` kernel prerelease。