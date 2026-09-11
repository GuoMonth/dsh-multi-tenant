# #57 实现与验收记录

日期：2026-09-11。源码版本 `dsh-multi-tenant@0.6.0`。唯一目标 DSH `0.1.5-rc.2` / `fb2c4b9e698e30edb738bca4cf0618587db7d203`。

## 主线交付

| 任务 | 实现记录 | 已验证能力 |
|---|---|---|
| #58 | [PR #64](https://github.com/GuoMonth/dsh-multi-tenant/pull/64) | 精确依赖、原生 MCP 重复 cursor 失败清理、行为化发布门禁 |
| #59 | [PR #66](https://github.com/GuoMonth/dsh-multi-tenant/pull/66) | 显式命令、取消与长任务分离、删除/撤销/刷新生命周期 |
| #60 | [PR #67](https://github.com/GuoMonth/dsh-multi-tenant/pull/67) | 冷读、原生 observation、开流追赶、分页、背压与断连 |
| #61 | [PR #69](https://github.com/GuoMonth/dsh-multi-tenant/pull/69) | 原生目录与 continuation、MCP/Secret scope、fork/冷恢复/撤销 |
| #62 | [PR #70](https://github.com/GuoMonth/dsh-multi-tenant/pull/70) | 原生 present/FS/HTTP、父子冷文件、越权拒绝、当前源文件与释放 |
| #63 / #72 | 关联 PR 见 [#63](https://github.com/GuoMonth/dsh-multi-tenant/issues/63) | 可选 profile/slots、实际浏览器、安装包 profile、安全历史投影收尾 |

## 自动化结果

Node 24.18.0 与 Node 22.19.0 均完整通过 `pnpm release:check`：verify / preflight / peers / TypeScript / 78 项 package tests / build / SQLite probe / 独立 tarball consumer。verify 另包含 2 项发布门禁回归。

消费者在独立目录安装 tarball 与 exact native profile peers，复用仓库已审查的版本及 build-script 策略，没有链接仓库源码。通过类型拒绝伪造 Principal、已删除 callback、根授权/API/观察/目录，以及包内 `examples/scoped-web/smoke.mjs` 的原生委派、present、文件访问和 stock 特权入口拒绝。

`profile.integration.test.ts` 使用实际打包的 rc.2 UI renderer/slot registry 和实际依赖，按其 ModuleLoader 封装加载，验证延迟声明后的 sidebar/main 注册与卸载。未声称已运行完整 stock Web shell 的图形集成。

## 真实浏览器

复现脚本：[browser-check.js](../../../packages/multi-tenant/examples/scoped-web/browser-check.js)。使用 agent-browser 在本机真实 DSH WebServer profile 上操作页面：

- Acme Alice、Acme Bob、Globex Alice 分别新建资源、发送、运行中 Steer/Stop。
- 通过原生 subagent 工具委派，进入真实 child 并验证冷续接、发送、Steer/Stop。
- 通过原生 present 交付 child workspace 文件，验证 sandbox 预览、HTML 惰性文本与按身份返回的下载内容。
- 重连重新建立基线，用户消息不重复，宿主注入的上下文不显示成用户发言。
- 72 次跨 Principal/跨根 GET、HEAD、消息、停止、history/events、child/file 请求全部返回 404。
- 三种身份访问 stock `/api`、settings、plugins、openWorkspacePath 均为 404。

结果：[JSON](./browser-results.json)、[页面文字](./browser-text.txt)、[完整截图](./scoped-panel.png)。`browser-errors.txt` 是 agent-browser errors 的原始空输出，表示未发现运行错误。另实际点击 Download 保存文件并核对内容，其 SHA-256 为 `abd826acfbb374e62c6df62975478afc8aa50c4bd35e893dc7a18bed899f9a59`；文件是测试报告，不是不可变交付归档。

## 明确保留的边界

F 按已批准方案交付受限授权 adapter + 显示 slot，不把完整官方聊天 UI 算作已多租户化。三项后续按用户要求保留 open：

- [#65](https://github.com/GuoMonth/dsh-multi-tenant/issues/65)：能力刷新时旧 disposer 失败可能遗漏新租约清理。
- [#68](https://github.com/GuoMonth/dsh-multi-tenant/issues/68)：AgentPresets standing scope 与逐 Principal 能力组合；不支持组合拒绝。
- [#71](https://github.com/GuoMonth/dsh-multi-tenant/issues/71)：stock Web 所有 transport/特权入口的 Principal 绑定。

共享运行仍是逻辑隔离，宿主负责认证、实际 FS/强隔离；one-shot 只读，深层冷续接需要活动的直接父级，没有本地 Session 事实的远程 run 不在目标目录内。没有执行 npm 发布或公网部署。
