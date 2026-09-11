# 可选 scoped Web profile

该示例只监听本机，使用真实 Cordis、AgentLoop、JSONL、Session query、spawn/continuation、present、FS 和 WebServer。模型是无密钥的确定性测试 adapter；页面可切换三种固定演示 cookie 身份，不作为生产认证。

```sh
pnpm install --frozen-lockfile
pnpm --filter dsh-multi-tenant demo
```

打开输出的 `/tenant-panel` URL，选身份、新建 Agent 并发送消息。`/hold` 持续运行到 Stop，可在运行中 Steer；`/delegate` 调用原生子代理工具。点击子级后可发送、停止、重连，或用 `/present` 交付其当前 workspace 报告。HTML 在 sandbox iframe 内作为惰性文本预览，Download 每次重新授权。

`DSH_MT_DEMO_DIRECTORY` 指定可重启复用的数据目录，`DSH_MT_DEMO_PORT` 指定本机端口（默认 0 自动分配）。同一目录只运行一个进程。重启后根归属和原生 Session 事实保留。tarball 的完整可选依赖安装命令见 [English 安装说明](./README.md)，随后运行包内 `smoke.mjs` 或 `server.mjs`；这些命令不表示 0.6.0 已发布到 npm。

`slots.mjs` 是官方 `sidebar.panellist` / keyed `main` Client 扩展，用宿主 React 经原生 Client pipeline 打包，以 iframe 打开授权面板。真实 rc.2 slot registry 的延迟声明/注册/卸载已由测试覆盖；真实浏览器验收运行的是独立面板。

slot 只是显示扩展，不会隔离 stock shell 的其他入口。该 profile 不装配 Connection/gateway/settings/plugin/desktop controller。完整官方 Web 集成留在 [#71](https://github.com/GuoMonth/dsh-multi-tenant/issues/71)，AgentPresets 能力组合留在 [#68](https://github.com/GuoMonth/dsh-multi-tenant/issues/68)。这里按 #63 已批准的备用方案交付受限 adapter，不宣称完整官方聊天 UI 已多租户化。

浏览器复验：启动示例后运行 `agent-browser --session dsh57 open http://127.0.0.1:PORT/tenant-panel`，再执行 `agent-browser --session dsh57 eval --stdin < packages/multi-tenant/examples/scoped-web/browser-check.js`。脚本通过真实页面验证三种身份的根/子级发送、Steer/Stop、委派、交付、重连，以及 72 次越权拒绝和 stock 特权入口 404。完成后用 `agent-browser --session dsh57 close` 关闭浏览器。脚本保留自身创建的演示资源供检查；packed release gate 中的 `smoke.mjs` 使用临时目录并自动清理。
