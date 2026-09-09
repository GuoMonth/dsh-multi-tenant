# dsh-multi-tenant

`dsh-multi-tenant` 是 DeepSeek Harness 的多租户插件。它把宿主认证得到的 `(tenantId, principalId)` 转换为有明确所有者的 Agent 资源，不接受也不暴露底层 DSH session identity。

当前源码版本：**`dsh-multi-tenant@0.5.0`**，精确固定 DSH **`0.1.5-alpha.1`** 和 commit **`5dda764ed3aa172535a7967b06ff95d9cbfe536a`**。发布身份为 **`v0.5.0`**，npm 分发使用 `latest` dist-tag。实际发布状态见 [GitHub Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases)。

本版本只支持 DSH `0.1.5-alpha.1`。DSH 仍是上游 alpha；项目只维护一条经过验证的精确基线，不承诺兼容过去或未来的 Harness 版本。`0.5.0` 替换 `0.4.0` 的 DSH peer 要求，Principal API 和 SQLite Agent Directory schema 保持不变。

插件负责 Principal-scoped Agent 授权、持久 SQLite Agent Directory、能力租约及 DSH Agent/MCP 生命周期。宿主负责认证、Secret 存储，以及需要时的进程/容器级强隔离。

新建 Agent 在 Directory 进入 ready 前先通过 DSH 完成单 session 持久化检查，空会话也必须落盘。持久化检查缺失或失败时，创建失败并释放已获取的 Agent。

Driver 改用真实 DSH registry/setup 类型和显式 branded identifier。原生生命周期验证使用 V3 日志，以及带显式 flush/close 的 `SessionHandle` 读取，并验证 writer 冲突及 dispose 后释放。历史日志由 DSH 自己处理，插件不维护日志迁移层。**回滚需要同时恢复升级前数据和对应旧 runtime。** 旧 runtime 可能读到保留的旧日志，却看不到升级后的新消息。

- [中文使用与 API](./packages/multi-tenant/README.zh-CN.md)
- [English](./README.md)
- [兼容性与升级](./docs/reference/compatibility.zh-CN.md)
- [发布检查](./docs/reference/release.zh-CN.md)
- [0.5.0 变更与重构决策](./docs/releases/v0.5.0.md)

```text
已认证请求
  -> 服务端创建 PrincipalContext
  -> opaque AgentId + Principal-scoped Directory 查询
  -> 能力与隔离检查
  -> DSH Agent create/resume + Agent-scoped MCP
  -> 受控的 withAgent() runtime view
```

Shared runtime 只提供逻辑隔离，不是 hostile-code 安全边界。Stock DSH `/api` 保持私有/管理用途。插件不扩张为认证网关、分布式所有权协调器、sandbox 或进程管理器。

[#50](https://github.com/GuoMonth/dsh-multi-tenant/issues/50) 的生命周期取消继续覆盖 MCP、Secret、runtime-partition 和 DSH setup。Shutdown 仍是合作式的，忽略 abort 的宿主代码可能延迟完成。`whenIdle()` 只等待 Agent 活动结束，不是持久化屏障。
