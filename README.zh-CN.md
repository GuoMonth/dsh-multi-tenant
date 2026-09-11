# dsh-multi-tenant

DeepSeek Harness 多租户插件，把宿主认证后的 `(tenantId, principalId)` 转换成有明确所有者的 Agent 资源。

当前源码版本 **0.6.0**，精确对齐 DSH **0.1.5-rc.2**，commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`。源码准备不等于 npm 发布；已发布产物以 [Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases) 为准。

| 能力 | 边界 |
|---|---|
| Agent CRUD 与显式 Queue/Steer/Stop | Principal-scoped SQLite 归属，原生 DSH 生命周期 |
| 冷历史与实时观察 | 原生 Session 快照，安全的人类/助手文本，不激活 Agent 或申请 Secret |
| 原生子代理目录与 continuation 控制 | 绑定根的引用，核验自己的 descriptor/header，继承 scoped MCP |
| 文件交付 | 自己的 present 事实，明确的 scoped FS，当前源文件字节，每次请求重新授权 |
| 可选 Web 示例及 sidebar/main slots | 授权 adapter 面板，不装配 stock 特权 API |

不承诺旧 API/schema/runtime 兼容，`withAgent` 已删除。共享 provider 只提供逻辑隔离；宿主负责认证、Secret 存储、文件系统策略和进程/容器隔离。SQLite 仅支持单活动进程；释放是合作式的，`whenIdle()` 不是持久化屏障。

在当前仓库执行 `pnpm install --frozen-lockfile` 后，运行 `pnpm --filter dsh-multi-tenant demo`。打开打印的本机 URL，可使用三种演示身份及无密钥模型，验证真实原生 Agent、子代理、Session 和文件链路。演示 cookie 不用于生产认证。

- [使用与 API](./packages/multi-tenant/README.zh-CN.md)
- [English](./README.md)
- [可选 Web profile 与浏览器验证](./packages/multi-tenant/examples/scoped-web/README.zh-CN.md)
- [升级与边界](./docs/reference/compatibility.zh-CN.md)
- [发布流程](./docs/reference/release.zh-CN.md)
- [0.6.0 变更](./docs/releases/v0.6.0.md)
- [#57 实现证据](./docs/evidence/dsh-rc2/README.md)
- [Principal 独立原生 Host 架构评估与可复现验证](./docs/evidence/native-domain-review/multiprocess/REPORT.zh-CN.md)

AgentPresets 能力 scope 组合与完整 stock Web 权限覆盖分别留在 [#68](https://github.com/GuoMonth/dsh-multi-tenant/issues/68)、[#71](https://github.com/GuoMonth/dsh-multi-tenant/issues/71)。不支持的组合明确拒绝；可选面板不代表完整官方 Web 已完成多租户化。
