[English](./README.md) | 简体中文

# dsh-multi-tenant-web

DSH Web 多租户集成：主体绑定、RPC/mux/WS 授权。

> **早期 spike。** 尚无生产 surface。web 强制调研位于 [`docs/`](../../docs) —— 见 [`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md)。

## 状态

M3 已收口：强制 surface 可通过 `ApiProxy` facade + `ctx.agents` 装饰器解决；唯一剩余的上游缺口是一个 request/connection-scoped principal（H3）。完整分析见文档。
