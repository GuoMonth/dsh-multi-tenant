# dsh-multi-tenant

`dsh-multi-tenant` 是 DeepSeek Harness 的多租户插件。它把宿主认证得到的 `(tenantId, principalId)` 转换为有明确所有者的 Agent 资源，不接受也不暴露底层 DSH session identity。

当前源码版本：**`dsh-multi-tenant@0.6.0`**，精确固定 DSH **`0.1.5-rc.2`** 和 commit **`fb2c4b9e698e30edb738bca4cf0618587db7d203`**。发布身份为 **`v0.6.0`**，npm 分发使用 `latest` dist-tag。实际发布状态见 [GitHub Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases)。

本版本只支持 DSH `0.1.5-rc.2`。DSH 仍是预发布版本；项目只维护一条经过验证的精确基线，不承诺兼容过去或未来的 Harness 版本。`0.6.0` 替换 `0.5.0` 的 DSH peer 要求，运行入口改为显式命令，SQLite Agent Directory schema 延续现有资源归属结构。

插件负责 Principal-scoped Agent 授权、持久 SQLite Agent Directory、能力租约及 DSH Agent/MCP 生命周期。宿主负责认证、Secret 存储，以及需要时的进程/容器级强隔离。

新建 Agent 在 Directory 进入 ready 前先通过 DSH 完成单 session 持久化检查，空会话也必须落盘。持久化检查缺失或失败时，创建失败并释放已获取的 Agent。

Driver 改用真实 DSH registry/setup 类型和显式 branded identifier。原生生命周期验证使用 V3 日志，以及带显式 flush/close 的 `SessionHandle` 读取，并验证 writer 冲突及 dispose 后释放。历史日志由 DSH 自己处理，插件不维护日志迁移层。**回滚需要同时恢复升级前数据和对应旧 runtime。** 旧 runtime 可能读到保留的旧日志，却看不到升级后的新消息。

- [中文使用与 API](./packages/multi-tenant/README.zh-CN.md)
- [English](./README.md)
- [兼容性与升级](./docs/reference/compatibility.zh-CN.md)
- [发布检查](./docs/reference/release.zh-CN.md)
- [0.6.0 变更与重构决策](./docs/releases/v0.6.0.md)

```text
已认证请求
  -> 服务端创建 PrincipalContext
  -> opaque AgentId + Principal-scoped Directory 查询
  -> 能力与隔离检查
  -> DSH Agent create/resume + Agent-scoped MCP
  -> 受控的 send/executeTool runtime view
```

Shared runtime 只提供逻辑隔离，不是 hostile-code 安全边界。Stock DSH `/api` 保持私有/管理用途。插件不扩张为认证网关、分布式所有权协调器、sandbox 或进程管理器。

[#50](https://github.com/GuoMonth/dsh-multi-tenant/issues/50) 的生命周期取消继续覆盖 MCP、Secret、runtime-partition 和 DSH setup。Shutdown 仍是合作式的，忽略 abort 的宿主代码可能延迟完成。`whenIdle()` 只等待 Agent 活动结束，不是持久化屏障。

### 按所属关系读取历史和观察

可选安装精确版本 `@deepseek-ai/dsh-session-query-sqlite@0.1.5-rc.2` 后，`service.read(principal, id, { before, limit, signal })` 返回安全的文字与 turn 历史；`service.observe(principal, id, { signal })` 返回可释放的异步流，分为 `replace` 基线、按游标追赶的 `append`、`status` 与按 attempt 区分的 `transient` 文字/重置。Web adapter 基路径下提供已认证 `GET /agents/:id/history` 和 `/events`（SSE）。重连重新替换基线；订阅前的临时文字不回放，最终持久消息替换临时显示。

冷读使用原生 Session observation，不启动 Agent，不申请 MCP 或 Secret。删除根资源、关闭服务、请求取消及 reader provider 可选的授权撤销 signal 都会关闭观察。宿主应为登录/ACL 撤销提供 signal。慢消费者显式失败后重连，禁止静默丢事件。自定义隔离 provider 必须在自己的 partition 实现 `openRead`，默认拒绝。原始事件与内部路径不向产品返回。

### 原生子代理目标

显式安装精确版本 subagent 服务及 in-process spawn/fork provider 后，`children(principal, rootId, { childRef? })` 读取 `subagentCatalog`；`read`、`observe`、`send`、`cancel` 的 options 接受 `childRef`（`cancel` 为第四参数）。引用采用绑定根资源的目录位置，重启后稳定，本身不授予权限；每一层都核验子级自己的 descriptor 和不可变 header。Web 路径为 `/agents/:id/children` 与 `/agents/:id/children/:ref/{history,events,children,messages,cancel}`，观察中包含安全的子级摘要。

one-shot 只读；continuable Queue/Steer 使用官方 host 入口并保留人类消息来源。直接冷子级可以通过活动根恢复；更深的冷链需先通过中间父级自己的 continuation 使其活动。没有本地 Session 事实的远程 run 不构成 Session 目标。根释放/撤销会清理原生 continuation 后代及其 scope。

共享 provider 支持未装配 AgentPresets 的 in-process 子级：同步原生 publication 阶段核验 exact runtime owner，把子 scope 接到父级能力层，继承 scoped MCP/Secret 并保留工具限制。已有不相容 preset scope 的子级明确拒绝；AgentPresets 组合另见 #68。自定义 backend 必须提供自己的读取与控制能力。这是逻辑隔离，不是操作系统文件或容器边界。

### 授权交付文件

`deliveries(principal, rootId, { childRef? })` 列出目标自己的原生 `deliverables/presented` 事实；`file(principal, rootId, ref, { childRef?, signal? })` 按目标绑定的 event/index 引用返回可释放字节流。Web 提供 `GET /agents/:id/deliveries` 和 `GET|HEAD /agents/:id/deliveries/:ref`，子级路径下同样适用；`?download=1` 强制下载。每次请求重新认证，引用不是 bearer 链接，不接受 path 参数。

宿主需在正确执行环境实现 `RuntimePartitionProvider.openFile` 才能启用。可选 `dsh-multi-tenant/deliveries` 的 `openNativeDelivery(request, { fs, workspace, signal?, dispose })` 接受明确授权的原生 FS 与可信 Principal workspace，核验规范路径包含关系，拒绝末级 symlink 和目录，读取有大小上限的当前字节。不把 Session cwd 当授权根，也不退回全局 host FS；别名与竞态保证仍由原生 backend 负责。默认上限 16 MiB（`maximumDeliveryBytes`，最多 256 MiB），辅助实现最多缓存该上限，再按有界分块传输。

源文件更新后下次读取获得新内容；删除后返回 404。响应使用 no-store、nosniff、安全文件名和 sandbox CSP，HTML/SVG 作为惰性文本，未知格式下载。断连、授权撤销、删除根和关闭服务会中止响应并释放 reader，已发出的字节不能收回。不提供不可变归档或桌面打开接口。
