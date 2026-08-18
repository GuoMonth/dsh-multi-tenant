[English](./README.md) | 简体中文

# dsh-multi-tenant-web

DSH Web 多租户集成：主体绑定、RPC/mux/WS 授权。

> **早期 spike。** 尚无生产 surface。web 强制调研位于 [`docs/`](../../docs) —— 见 [`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md)。

## 状态

M4 进行中。准入装饰器（②-A）与真实 `ApiProxy` facade + unary 穷举分类（②-B）已完成。`CLASSIFICATION` 覆盖当前全部 52 个 unary RPC 方法；DSH 新增方法时，未分类前会直接令 `tsc` 失败。

v0 策略刻意默认拒绝：session-keyed point 方法为 `guard`，目前只有 `session.list` 适合 `filter`，`session.create` 为 `admit`（transport 尚未安装发布前准入 bridge 时直接拒绝），未建模的 host/deployment 管理面以及 `session.search` 都为 `deny`。流（`events`）、`respond` 与 `downloads` 在 ②-C 证明真实 transport 授权路径之前继续拒绝。H3 仍是待验证的 principal 绑定假设，而不是已经提交的上游结论。
