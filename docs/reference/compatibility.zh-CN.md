# 兼容性

`dsh-multi-tenant@0.5.0` 支持 Node `^22.19.0 || >=24.0.0`，唯一 DSH 基线为 `0.1.5-alpha.1`，源码 commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`。Release identity 为 `v0.5.0`，通过 npm `latest` dist-tag 分发。

当前源码只支持这一条 DSH 基线。直接 DSH peer/dev dependency 和 lockfile 中解析出的 DSH 包均精确固定；旧发布的支持范围保留在历史记录中。不承诺向前兼容或无限期向后兼容。插件的版本形式不会改变 DSH 仍是 alpha 的事实。

## 从 0.4.0 升级

`0.5.0` 将 DSH 要求从 `0.1.2-rc.1` 切到 `0.1.5-alpha.1`。Principal API、provider 协议、公开资源 identity 和 SQLite `tenant_agents_v04` schema 保持不变。Driver 开始直接使用官方 LLM identifier 构造器，因此 `@deepseek-ai/dsh-llm` 成为显式 exact peer。

[完整上游比较](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.2-rc.1...dsh-v0.1.5-alpha.1) 包含 SessionHandle 生命周期、V2/V3 日志、显式 Agent API、type-only Inbox、persona 前后缀拆分、普通 subprocess handle 变化及新版 Web UI。宿主自定义插件和 profile 必须按这些契约审核；原生集成测试不覆盖任意宿主扩展。

先停止活动宿主，再一致备份 Agent Directory、DSH session/storage 数据和配置，并保存对应的旧 runtime 与依赖身份。整体升级 DSH 包，在目标 runtime 验证 create、resume、授权、MCP 和 shutdown 后再恢复服务。

DSH 可以把受支持的历史会话迁移为 V3 generation 并保留旧文件。插件不解析、不转换历史日志。保留原文件不等于可无损降级：RC.1 实验会恢复旧 generation，读不到 V3 写入的新消息。回滚须同时恢复升级前的数据和对应旧 runtime；升级后的新增内容不在该回滚点内。禁止新旧 runtime 共用可写数据目录。

## Runtime 与持久化契约

Driver 使用有类型约束的 `AgentRegistry.create/resume`、`AgentSetup` 和显式 Agent/tool identifier，不使用 `ctx.agent`、Inbox 构造器或已移除的持久化方法。当前租户 Agent 是 runtime root；以后增加子 Agent 必须显式传入 `parentAgent`，不能依赖环境 context 推断。

Shared driver 要求 DSH Session store 和可用的持久化 listener。它在返回新建 handle 前等待 `ctx.sessions.flush(agent.session)`，确保空会话也在 Directory ready 前落盘。Listener 缺失或检查失败时会释放 handle 并拒绝发布。自定义持久化 `DshRuntimeDriver.create()` 也必须在返回前达到可恢复的持久化边界；这是生命周期要求，没有新增公共方法。

`TenantAgentRuntime.whenIdle()` 等待 Agent 活动结束，不保证持久化完成。宿主检查持久化日志时，使用 `await ctx.sessionPersistence.flush()`、`open(id, 'read')`、`read()`，并在 `finally` 中 `close()`。Live transcript 和持久化日志是不同读取语义。原始 SessionHandle 继续由可信宿主/DSH 生命周期持有，不加入租户 runtime view。

DSH writer 锁只保护单个 session 的 JSONL 生命周期，不协调 Principal 所有权、不保证多活动进程共享 SQLite Directory，也不提供分布式 fencing。内置 Repository 仍要求 local、single-node、single-active-process。

Provider lifecycle `AbortSignal` 仍为必填，取消仍是合作式。插件不读取或迁移 `0.3` ownership 数据、已退役的 Session claim、Operation、RuntimeComposition 或兼容 facade。

## 公共面与验证

公开代码/API 子路径只有 package root、`/mcp`、`/sqlite`、`/web`、`/testing`、`/starter`。另外导出 `./cordis.patch.yml` 作为 DSH loader 配置数据；其余实现均为 private。

CI 在 Node 22.19 和 Node 24 上运行 frozen install 和完整发布检查，并单独 checkout 精确上游源码身份。原生测试使用真实 AgentLoop、V3 JSONL 和官方 MCP，覆盖重启、授权、删除后保留日志、并发 reader/writer 和 dispose 后释放 writer。测试不替换 Agent factory 或 Session。详见[发布检查](./release.zh-CN.md)和[重构决策](../releases/v0.5.0.md)。
