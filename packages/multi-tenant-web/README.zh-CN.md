[English](./README.md) | 简体中文

# dsh-multi-tenant-web

DSH Web 多租户集成：主体绑定、RPC/mux/WS 授权。

> **早期 spike。** 尚无生产 surface。web 强制调研位于 [`docs/`](../../docs) —— 见 [`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md)。

## 状态

M4 进行中：准入装饰器（②-A）与真实 `ApiProxy` facade + 穷举分类（②-B）已完成。`bindTenant` 包装真实的 `@deepseek-ai/dsh-host-apiproxy` `ApiProxy`；`CLASSIFICATION` 为全部 52 个 unary RPC 方法赋 `allow` / `guard` / `filter` / `deny` 判定（新增 DSH 方法会令 `tsc` 失败）。流（`events`）与 `respond` 在 ②-C / H4 之前按拒绝处理。唯一剩余的上游缺口是 request/connection-scoped principal（H3）。见 [`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md)。
