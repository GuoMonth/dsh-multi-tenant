> Archived snapshot; not current requirements. See the documentation index and active Issue for current scope.

# DSH 0.1.5-alpha.1 兼容性与规划审查

审查及实施日期：2026-09-09。初始评估从仓库 `35a6b7c`、插件 `0.4.0` 开始；当前工作树已推进为 `0.5.0`。

结论：**存在破坏性变更，但本轮源码审查与实际运行没有发现需要推翻多租户架构的变化。已在当前工作树完成精确基线对齐；不能仅替换版本号就宣布兼容，也不能把程序降级视为数据回滚。**

初始兼容性实验在临时副本完成；随后用户明确要求实施对齐，正式依赖、源码身份和中英文文档已切换至目标，源码版本为 `0.5.0`。进一步补查发现并修复了空会话持久化漏洞，见下文实施结论。npm 和 GitHub 发布尚未执行。

## 比较范围

- 升级前基线：DSH `0.1.2-rc.1`，commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`。
- 目标基线：DSH `0.1.5-alpha.1`，commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`。
- 比较包含中间 `0.1.3-alpha.1` 的 SessionHandle / V2，以及 `0.1.3-alpha.2` 的 persona / subprocess / 默认工具变化，不能只看最后一次 release delta。
- 来源：[目标发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.1)、[完整基线比较](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.2-rc.1...dsh-v0.1.5-alpha.1)，以及两个精确 tag 的源码。

## 影响矩阵

| 变化 | 本项目实际影响 | 规划判断 |
| --- | --- | --- |
| 空 session 延迟物化 | 资源已 ready 但未发送消息，正常关闭后无法 resume，实测报 SessionPersistenceNotFoundError | 已修复：新建 handle 返回前通过原生单 session flush，缺失或失败时拒绝发布并清理 |
| Session persistence 改为 `create/open` 返回 `SessionHandle`，删除 `load` 等旧入口 | 原生集成测试有三处 `load()`，升级后类型检查与运行均失败。生产 driver 通过 `agents.create/resume` 间接管理持久化，没有调用被删除的入口 | 适配测试读取及关闭 handle；无需自建持久化兼容层 |
| 读取持久化与读取 live Session 的语义分离 | 仅把 `load(id)` 改成 `open(id, 'read').read()` 后，注入 marker 的即时读取返回空 events；`whenIdle()` 不能代替持久化屏障 | 对落盘断言显式 `await sessionPersistence.flush()`，再读取并在 finally 中关闭 read handle |
| Session 格式升至 V3，历史日志迁移为相邻 generation | 真实 RC.1 日志能恢复为 V3；原文件保留。但新数据不能供旧 runtime 完整读取 | 升级前保存一致的数据备份；回滚必须绑定旧程序与对应旧数据，不能承诺升级后新增内容可无损降级 |
| `ctx.agent` 删除，setup 新增显式 `agent` 参数 | 当前代码不使用 `ctx.agent`；工具执行已传入 `agent`；MCP setup 只使用 scoped context，允许忽略新增参数 | 当前实现无需改动；未来宿主插件必须按显式 Agent API 编写 |
| `Inbox` 变成类型接口，移除公共 `hasPending/claim` | 当前只透出 Agent 的 `followup/steer/inject`，没有构造或直接操作 Inbox | 当前公共入口不受直接影响 |
| Agent runtime parent 改为显式 `parentAgent`，修正子代理 root 调度 | 当前多租户 driver 创建独立根 Agent，没有依赖隐式父子归属 | 不破坏现有模型；以后增加子代理时区分 runtime ownership 与持久化 lineage |
| JSONL 引入生命周期级单 writer 锁 | 真实 create/restart/resume/delete 经新 backend 通过；锁随 handle 释放 | 不替代 SQLite Directory 的单活动进程约束，更不构成多节点授权或 fencing |
| Persona 拆分、普通 subprocess handle 删除 pid、默认编辑工具变化 | 当前插件源码没有这些直接调用；宿主自行配置的 profile/provider/plugin 不在此次测试范围 | 宿主升级须审核配置；现有最小运行接口不需为此扩张 |
| Web Detail 面板被 Sidebar 替换 | 当前 `/web` 是认证后 CRUD adapter，没有依赖上游 Detail 组件 | 不影响当前插件；复用原生 Web 的浏览器验收需要更新 |

关键源码：[持久化接口](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-persistence/src/index.ts)、[SessionHandle](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-persistence/src/handle.ts)、[Agent registry/setup](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/core/agent/src/index.ts)、[JSONL writer lease](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/session/session-persistence-jsonl/src/lease.ts)。

## 初始临时副本验证

环境：Linux x64、Node `24.18.0`、pnpm `11.7.0`。从本仓库 HEAD 导出临时副本，切换全部现有 DSH direct dependency / override 到目标版本，使用官方 npm 产物安装。

1. 原代码直接换依赖：类型检查仅三处 `SessionPersistence.load` 报错；测试 **57/58 通过**，原生集成在第一次 `load` 调用失败。
2. 只换 `open/read/close`：类型检查和 build 通过，但集成测试读不到刚 inject 的 marker。这是可见性边界变化，不能通过删断言规避。
3. 在持久化读取前显式 `flush()`：**58/58 通过**，包括真实 DSH Agent、两个 Principal 使用同名 MCP 的隔离、持久化、重启恢复、越权拒绝和删除。类型检查、build、peer check、SQLite restart/CAS/默认权限 probe 通过。生产 `src/` 没有修改。

临时副本中的读取适配：

```ts
async function readStored(ctx: Context, id: ReturnType<typeof SessionId>) {
  await ctx.sessionPersistence.flush()
  const handle = await ctx.sessionPersistence.open(id, 'read')
  try {
    return await handle.read()
  } finally {
    await handle.close()
  }
}
```

额外使用两个版本的真实 AgentLoop + JSONL，分进程验证历史数据：

| 操作 | 观察到的格式 | RC.1 marker | V3 新 marker |
| --- | --- | --- | --- |
| RC.1 创建、注入、正常关闭 | V0 | 已写入 | 无 |
| 目标版本 resume | V3 | 可见 | 随后写入 |
| 目标版本再次 resume | V3 | 可见 | 可见 |
| RC.1 回头 resume 同一目录 | V0 | 可见 | **不可见** |

另一次迁移在降级操作前校验了原始 `session.jsonl` 的 SHA-256：迁移前后相同，同时新增 `session.v3.jsonl` 和 `session.lock`。这证明保留原文件不等于可读取升级后的数据；RC.1 在这个实验中会回到旧 generation，而非必然报错拒绝。

初始迁移实验覆盖有效的待处理注入消息日志，不代表覆盖所有历史 assistant/PTC/fork 日志、异常中断或自定义事件。该阶段未运行 Node 22、tarball smoke 或完整 release gate；后续正式实施的验证与变化单独记录如下。没有执行付费模型请求或公网部署。

## 依赖与发布门禁

官方 npm 已存在目标版本的 `dsh-agent`、`dsh-session-persistence-jsonl` 和 `dsh`，位于 `alpha` 通道；不能使用 `latest/next` 推断目标版本。

直接替换现有 pin 后，本仓库 24 小时 minimumReleaseAge 门禁拒绝了新增的 format/http-proxy 与原生 addon 依赖。临时副本仅为这些确切版本增加 exception，并为六个新增 DSH 包增加 exact override；没有关闭全局 age policy。正式工作树已同步这些 exact 约束并通过冻结安装；完整 Node 矩阵结果见下。

新增 DSH 包包括 `dsh-http-proxy`、`dsh-session-format`、`dsh-session-format-catalog`、`dsh-session-format-v0-to-v1`、`dsh-session-format-v1-to-v2`、`dsh-session-format-v2-to-v3`。JSONL 的 POSIX 锁依赖 `@deepseek-ai/node-addon-system@0.1.2` 及平台包；不能沿用旧依赖清单就认为 runtime closure 完整。

正式实施已更新 `scripts/dsh-target.mjs`、精确依赖、源码身份与文档，源码版本改为 `0.5.0`，只支持目标 DSH。版本与 npm 通道读取 package manifest，上游身份读取 DSH target，不再在检查脚本中复制常量。没有操作 npm dist-tag 或发布。

## 正式实施：空会话持久化边界

初始原生生命周期测试先注入消息再重启，未覆盖空 Agent。实施时新增“创建成功、没有发送消息、正常关闭、重启恢复”测试，真实复现 `SessionPersistenceNotFoundError`：DSH 延迟物化空 session，而 SQLite 已将资源标记 ready。

因此本次不能只改测试：Shared driver 在返回新建 handle 前通过 `ctx.sessions.flush(handle.agent.session)` 完成原生单 session checkpoint。缺失持久化 listener 或 flush 失败均拒绝发布并 dispose handle；service 既有失败路径把 Directory provisioning 置为 failed。此处不使用全局 flush，也不向租户暴露持久化 handle。自定义持久化 driver 的 create 也须以可恢复的 session 为成功边界。

真实集成测试新增空 Agent 重启、缺失 durability listener 拒绝、checkpoint 失败后 Directory 隐藏及 writer 释放、另一个 runtime 的 reader/writer 竞争与 dispose 后接管。Driver 同时改用真实 AgentRegistry/AgentSetup 和官方 SessionId/ToolCallId/ReasoningEffortId；新增 exact LLM peer。Provider 方法签名和 SQLite schema 保持不变。

## 最终本地验收

| 环境 / 检查 | 结果 |
| --- | --- |
| Linux x64，Node 24.18.0，pnpm 11.7.0 | frozen install 与 `pnpm release:check` 通过；62/62 测试，含安装后 tarball consumer |
| Linux x64，Node 22.19.0，pnpm 11.7.0 | 同一 frozen install 和完整 release check 通过；62/62 测试，含安装后 tarball consumer |
| 源码身份 | 独立 checkout 的 HEAD 和根 package version 与 DSH_TARGET 完全一致 |
| 非 DSH 依赖 | 没有移除或升级原有非 DSH resolution；新增官方 native addon 平台包及 HTTP proxy 所需 undici |

两套 release check 均包含 package/contract/preflight、peer、类型检查、真实生命周期、build、SQLite restart/CAS/权限和打包消费者检查。测试中对无 backend、checkpoint 失败与空 session 恢复的结论来自真实 DSH AgentLoop/Session；没有替换 factory。GitHub CI、npm 发布、Git tag 和公网部署未执行。

## 对规划的结论

Principal → opaque AgentId → Principal-scoped Directory → runtime partition → Agent-scoped MCP 的分工保持成立。授权目录不解析 DSH 日志，生产 driver 依赖较窄的 registry/handle 接口，使本轮重构集中在 driver 的创建持久化边界、类型约束及发布门禁，无需重写业务授权和 SQLite schema。

继续只支持一条经验证的精确 DSH 基线。后续可以用新插件版本替换支持基线，无需承担跨所有 DSH 版本的兼容 façade 或自行维护日志转换器。公开说明每个版本支持什么、升级会改变什么即可；不能把 alpha 上游当成稳定扩展接口。

同时只读核对了相邻 `dsh-isolated-runtime` 的 roadmap 和兼容契约：其基线为 `0.1.3-alpha.1`，快照恢复已经绑定精确镜像与 DSH 版本，Cell 数据备份与隔离职责不会因 V3 自动失效。现有 `cell-settings.patch` 对目标源码通过 `git apply --check`；browser-auth 源文件在两个 tag 间没有变化，但 connection/gateway 有变化，不能据此宣称浏览器链路已通过。升级该项目仍需重新建立源码/镜像基线并执行其 browser、shutdown、CSI 与平台门禁。本次未改动或运行该项目的完整验收。
