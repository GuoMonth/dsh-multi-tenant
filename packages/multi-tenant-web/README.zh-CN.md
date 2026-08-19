[English](./README.md) | 简体中文

# dsh-multi-tenant-web

实验性的 DSH Web tenant-bound `ApiProxy` enforcement 研究。

> **在 0.1 kernel release 中仅保留在仓库。** 这个 workspace package 已设为 `private: true`，在 production principal-binding contract 仍依赖 DSH request/connection-scoped transport seam 时，刻意禁止发布。R3 只发布 `dsh-multi-tenant`。

## 状态

真实 `ApiProxy` facade 与 unary `RpcMethodMap` 穷举分类已经实现。当前策略刻意 fail-closed：

- session-keyed point method 为 `guard`；
- 当前只有 `session.list` 为 `filter`；
- `session.create` 为 `admit`，在 principal-scoped pre-publication admission 可以安装以前继续拒绝；
- `session.search`、host/global management、streams、`respond`、downloads 在真正具备支持的 tenant 语义以前继续拒绝。

DSH RC7 公开的 `ConnectionRpcHandler` 只暴露解码后的 `(endpoint, payload, signal)`，真实 HTTP/WS request 留在 DSH Web carrier 内部。官方 carrier 文档也明确说明当前没有 authentication layer。因此 principal-scope 缺口被归类为**生态 seam**。

## 下一步

这个 package **不阻塞，也不会随第一次 `dsh-multi-tenant` kernel prerelease 一起发布**。Web 的下一项交付是一个小而通用的 upstream request/connection-scope proposal。DSH 提供足够 seam 以后，本 package 再增加 principal-bound HTTP/WS admission、streams、`respond` 与 two-tenant E2E suite，然后再冻结 production public contract。

参见 [`ROADMAP.md`](../../ROADMAP.md) 与 [`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md)。
