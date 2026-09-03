# dsh-multi-tenant

`dsh-multi-tenant` 是 DeepSeek Harness 的多租户插件。它把宿主认证得到的 `(tenantId, principalId)` 转换为有明确所有者的 Agent 资源，不接受也不暴露底层 DSH session identity。

当前版本：**`dsh-multi-tenant@0.4.0-alpha.3`**，精确固定 DSH **`0.1.2-rc.1`** 和 commit **`a66e4702047846cdaa10c66c9d3df3951f5ea70d`**。对应的源码 tag 是 **`v0.4.0-alpha.3`**。

Alpha.3 是供 DSH 宿主集成和反馈使用的预发布版本，不承诺稳定兼容。适合已经由宿主负责认证，并接受文档所述 single-active-process 与逻辑隔离边界的产品接入。npm 分发只使用 `alpha` dist-tag，不移动 `latest`；npm 发布和 GitHub prerelease 是独立于源码 tag 的显式分发操作。

插件负责 Principal-scoped Agent 授权、持久 SQLite Agent Directory、能力租约，以及 DSH Agent/MCP 生命周期。宿主仍负责认证、Secret 存储，以及需要时的进程/容器级强隔离。

Alpha.3 保留 alpha.2 在全新 `0.4` 架构上补齐的两个运行契约：

- 遗留的 SQLite `provisioning` 记录会在 service 对外可用前确定性地进入终态 `failed`；
- MCP、Secret、runtime-partition 和 DSH setup provider 会收到合作式生命周期取消信号，返回结果在使用前经过校验。

DSH alpha.5 到 RC.1 的上游差异只有 release metadata，没有修改 Agent、Session、persistence、MCP 或 Tools 源码。Alpha.3 仍会把全部直接 DSH peer/dev dependency 和源码身份门禁精确推进到 RC.1，并重新执行完整原生生命周期与打包消费者证据。

它不会扩张成公网认证入口、分布式所有权系统、sandbox 或进程管理器。这些职责继续由宿主承担，或通过明确的 provider 协议实现。

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

Alpha.2 会把 service lifecycle `AbortSignal` 传入 MCP、Secret、runtime-partition 和 DSH setup，完成 [#50](https://github.com/GuoMonth/dsh-multi-tenant/issues/50)。Shutdown 仍是 cooperative 的：忽略 abort 或永不结束的宿主代码仍可能延迟完成，插件不会增加强制终止或默认 timeout。
