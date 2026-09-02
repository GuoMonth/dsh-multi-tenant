[English](./CONTRIBUTING.md) | 简体中文

# Contributing

项目只有一个定位：DSH 多租户插件。变更优先保证当前正确性、可执行证据和精简 live tree；已经被替代的 prerelease 设计没有兼容义务。

Authority 链路是：

```text
宿主认证
  -> 服务端创建 PrincipalContext
  -> Principal-scoped Agent Directory
  -> capability/isolation lease
  -> DSH Agent + Agent-scoped MCP
  -> 受控 withAgent() runtime
```

优先使用 Cordis service 和 DSH 原生 Agent/MCP lifecycle。多个真实 integration 尚未证明需求前，不要增加第二套 DI/lifecycle system 或通用框架。

插件不能独立保证的性质，应提供窄协议并明确边界。当前例子是 `PrincipalProvider`、`SecretProvider`、`TenantAgentRepository`、`RuntimePartitionProvider`。

重要变更合并前：

- 每次 Agent 查询同时限定 Agent、Tenant、Principal；
- authority、capability 或最低隔离不足时，在 DSH 工作开始前 fail closed；
- 补充可执行 lifecycle/concurrency/failure 证据；
- 保持 Node 22.19 和 Node 24 通过；
- public surface 变更必须测试 packed artifact；
- 更新精简的双语使用/安全说明；
- 删除被替代的代码和临时调研产物。

执行 `pnpm release:check`。这个命令不会发布；`packages/multi-tenant/package.json` 是 release identity 的 source of truth。
