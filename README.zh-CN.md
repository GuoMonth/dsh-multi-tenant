# dsh-multi-tenant

`dsh-multi-tenant` 是 DeepSeek Harness 的多租户插件。它把宿主认证得到的 `(tenantId, principalId)` 转换为有明确所有者的 Agent 资源，不接受也不暴露底层 DSH session identity。

当前版本：**`dsh-multi-tenant@0.4.0-alpha.1`**，精确固定 DSH **`0.1.2-alpha.5`**。

状态：**源码已达到 release-ready，按计划保持未发布**。`0.4.0-alpha.1` 的实现和复盘门禁已经完成；发布仍是独立的显式操作。目前不存在 `0.4` npm 包、tag 或 GitHub Release。

插件负责 Principal-scoped Agent 授权、持久 SQLite Agent Directory、能力租约，以及 DSH Agent/MCP 生命周期。宿主仍负责认证、Secret 存储，以及需要时的进程/容器级强隔离。

- [中文使用与 API](./packages/multi-tenant/README.zh-CN.md)
- [English](./README.md)
- [兼容性](./docs/reference/compatibility.zh-CN.md)
- [发布检查](./docs/reference/release.zh-CN.md)

```text
已认证请求
  -> 服务端创建 PrincipalContext
  -> opaque AgentId + Principal-scoped Directory 查询
  -> 能力与隔离检查
  -> DSH Agent create/resume + Agent-scoped MCP
  -> 受控的 withAgent() runtime view
```

默认 shared runtime 只提供逻辑隔离，不是 hostile-code 安全边界。Stock DSH `/api` 保持私有/管理用途，不是公网多租户入口。
