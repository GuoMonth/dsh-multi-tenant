> Archived snapshot; not current requirements. See the documentation index and active Issue for current scope.

# DSH rc.2 对齐与原生多租户能力开发方案

日期：2026-09-11。状态：主线已实现；合入状态以关联 issue/PR 为准。F 按本计划的受限 adapter 备用方案交付，完整 stock Web 保留在 #71。目标 DSH：`0.1.5-rc.2`，commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`。

跟踪：[总 issue #57](https://github.com/GuoMonth/dsh-multi-tenant/issues/57)。以下任务分别对应 #58–#63；实现状态以 GitHub issue 为准。

## 实施结果（2026-09-11）

A–E 分别由 PR #64、#66、#67、#69、#70 实现并合入。F 提供可执行的本机 Cordis profile、原生 sidebar/main 扩展和受限授权面板，采用下文已规划的备用方案。真实浏览器覆盖三身份、原生委派/交付及 72 次越权拒绝；安全历史投影的验收修正跟踪在 #72。最终签名以包 README 为准，以下拟定签名保留为设计输入。

后续统一处理：#65 刷新中旧 disposer 失败的租约清理、#68 AgentPresets 与 Principal scope 组合、#71 完整 stock Web 的 Principal 绑定。它们没有被悄悄算作已完成能力。详细证据见 [验收记录](../evidence/dsh-rc2/README.md)。

## 目标与设计原则

把当前根 Agent CRUD + callback 运行接口，推进为 Principal 授权下的原生运行控制、只读观察、子代理和文件交付。只验证目标版本；旧 API、schema 和旧 runtime 没有兼容义务，不设置弃用转发层。保留机制必须有当前行为上的理由。

多租户项目拥有根资源归属、授权准入与能力撤销；DSH 拥有消息调度、Session 日志、projection、子代理事实和交付事件；宿主拥有认证、Secret 后端和真实执行隔离。保持单节点、单活动进程的当前部署范围。

评估依据：同目录的 `dsh-0.1.5-rc.2-assessment.zh-CN.md`。临时依赖切换后原有 62 项测试通过；加入两个评估探针后 Node 22/24 均为 64 项通过。此证据不是正式发布验收，也不覆盖完整 profile、真实委派或文件链路。

## 工作拆分

| 任务 | 交付 | 前置 |
|---|---|---|
| [A · #58](https://github.com/GuoMonth/dsh-multi-tenant/issues/58) | 精确基线、MCP 回归、行为化门禁 | 无 |
| [B · #59](https://github.com/GuoMonth/dsh-multi-tenant/issues/59) | 生命周期与实时命令分离，替换 withAgent | A |
| [C · #60](https://github.com/GuoMonth/dsh-multi-tenant/issues/60) | Principal 授权后的只读快照和持续观察 | B |
| [D · #61](https://github.com/GuoMonth/dsh-multi-tenant/issues/61) | 根资源下的原生子代理访问与控制 | B；目录观察集成使用 C |
| [E · #62](https://github.com/GuoMonth/dsh-multi-tenant/issues/62) | 基于交付事实的授权文件访问 | C + D |
| [F · #63](https://github.com/GuoMonth/dsh-multi-tenant/issues/63) | 可选官方 profile/slot 接入与整体验收 | C + D + E |

A 单独形成可发布的基线对齐提交，不能被后续产品扩展无限阻塞。B 是下一轮功能开发起点。C/D 可以在 B 的接口确定后分别推进；此为依赖划分，不要求并发修改共享文件。每个任务至少一个聚焦 PR，复杂任务可先协议与失败用例、再实现和原生验收；每个合入提交都应通过适用门禁。

## A：基线与门禁

修改 `packages/multi-tenant/package.json`、`pnpm-workspace.yaml`、lockfile、`scripts/dsh-target.mjs`、当前双语 README/参考文档、测试版本标题和发布说明。建议基线发布身份为 `0.6.0`；若后续先合并 API 改造，则按最终内容确定发布身份，不预先承诺所有任务属于同一次发布。

把真实重复 tools/list cursor 的 stdio fixture 和创建失败回归收录到测试。保留 ready 前 session flush，以及无 listener、flush 失败、空会话恢复等已有行为验收。

清理 `verify-contract.mjs` 和 `release-preflight.mjs` 中历史文件名黑名单、源码字符串断言、固定标题/文案和重复 export 常量。版本/源码身份、精确闭包、发布入口、SHA 固定、包内产物及消费者类型测试继续验证；清理时让代表性的错误版本、缺失导出产物和失效 public type 仍被门禁拒绝。删除 bundle 首行陈旧版本注释。

验收：Node 22.19/24 frozen install + release:check；原生 Agent/MCP/SQLite、tarball consumer；重复游标失败后资源隐藏且 handle 释放。记录 exact commit 的 CI 结果，发布按现有手动流程执行。

## B：运行控制与生命周期

### 拟定服务面

以下是实施输入，不是已发布签名；用 packed consumer 编译与真实 DSH 调用确定最终命名。

- `create/get/list/delete(principal, ...)`：根资源管理。
- `send(principal, target, input, { delivery: 'queue' | 'steer', signal? })`：完成输入准入后返回 receipt，不等待模型运行结束。
- `cancel(principal, target, { reason? })`：只作用于已在线且未失效的 generation；冷资源返回明确的 inactive 结果，不为停止操作调用 resume 或获取新 Secret/MCP。
- `whenIdle(principal, target, { signal? })`：可取消的活动等待，不是持久化保证，不占生命周期队列。
- `executeTool(principal, target, name, args, { signal? })`：可信宿主方法，调用原生工具管线；不做浏览器任意工具执行端点。
- `inject` 如仍有真实宿主消费者，作为显式可信宿主方法保留其语义；否则删除。旧 `withAgent` 与公开 runtime callback view 随消费者迁移移除。

Web 发送 body 只接受产品输入和 delivery，宿主构造可信 message source；禁止客户端传入 plugin source、Tenant/Principal、Session ID、模型配置或任意 metadata。原生消息准入 receipt 不等于持久化确认或 exactly-once delivery。

### 内部所有权和并发

把当前 live/tails 逻辑集中到内部 activation 管理模块（建议 `activation.ts`），不导出另一套框架。每个在线实例有单调 generation、closing/invalidated 标记、handle、能力租约、活动 operation 集合和 drain 信号。

1. 资源操作先以 Principal 查询 Directory。未授权请求不能触发 provider、session 读取、Agent 激活或撤销别人的在线实例。
2. create/resume/refresh/delete 在逐资源队列中串行；同一 activation 的并发激活请求合并。provider 返回后重新校验 shutdown、撤销和 generation。
3. 命令准入在 generation 校验与方法提交之间不 yield。send 的激活/刷新准备可等待生命周期操作；实际 receipt 不等待整轮任务。
4. 对已有 live generation 的 cancel 走独立短路径，不排在进行中的 tool/whenIdle 后；closing 实例不得重新获得操作权。
5. executeTool 和其他耗时操作登记内部引用，在锁外等待，并组合请求、generation 和 service signal；finally 释放引用。它们不阻塞新的 cancel。
6. delete/revoke/refresh/shutdown 先封闭准入、失效旧 generation 并发出 cancel，再等待已接纳操作与 DSH teardown，最后释放 partition/Secret。删除先完成 Principal 授权，失败不能撤销任何他人资源。
7. 等待是合作式的；没有强杀保证。不要为永不响应 abort 的宿主代码伪造已完成的 drain，也不加未经语义定义的固定超时。
8. 对 cancel 与 refresh 同时发生、删除 tombstone 提交失败、dispose 失败定义确定结果和可观测错误；失败路径不能重新开放已失效 generation。

修改 `service.ts/protocols.ts/runtime-driver.ts/provider-results.ts/web.ts/index.ts`、相关测试与消费者文档。现有 Web member prefix handler 只接受单段 ID，新增子路由时要明确路由匹配与拒绝未知路径。

验收以确定性的 deferred barriers 控制时序：长 tool/idle 等待期间 cancel/steer 被及时准入；并发 activate 只建立一次 live 实例；delete/revoke/refresh cutoff 后旧操作不可再提交；错误 Principal 不触发副作用；abort 传至工具；失败清理无遗漏。真实 DSH + 可控无付费模型 provider 验证 Inbox 行为，不替换 Agent factory。

## C：只读观察

新增 `observation.ts` 和少量明确的 client-safe DTO；保留服务端原生类型，逐字段决定 wire 表示，不直接序列化整份 Session/projection/Context。

- `read(principal, target, { before?, limit, signal? })` 返回有界历史页与持久 cursor。
- `observe(principal, target, { signal? })` 返回可释放订阅；持久 history delta、在线状态 baseline 和临时 assistant frame 分别表达。
- 每次建立观察先授权根资源；冷读使用原生 SessionQuery observation，不创建 Agent、不申请 MCP/Secret。外部 partition 若不支持这种读取，以可选窄读取协议声明能力，不能退回共享本地 store。
- follow 应在初始读取前建立并定义 cut，避免 page/follow 间漏事件；复用官方原生服务能提供的恢复语义。需要不受支持的内部入口时，记录具体上游缺口，不复制整套 session controller。
- 请求断开、显式 dispose、删除和 service close 都释放观察。订阅期间权限变化由宿主可选的授权撤销 signal 驱动；静态 Principal 本身不提供账号禁用通知。Secret 撤销不等同于历史读取权限撤销。
- 页面、cursor、资源引用均绑定授权目标；结构化 Session ID、路径和内部错误不得未经审查透出。消息正文可能由用户/模型包含路径或 ID，不把结构化字段过滤宣传为任意内容脱敏。
- 本轮仅按资源读取/观察；跨资源全文搜索需在查询前限定授权集合，不能先全库搜索再过滤，本任务不隐含实现搜索。

验收：冷读不增加 registry 实例；跨 Principal 与跨租户读取前拒绝；分页有界；opening gap/断线重连无持久事件遗漏或重复；瞬态 frame 不冒充 durable event；销毁释放所有 lease。Web carrier 用实际 HTTP 断开和重连测试。

## D：原生子代理

目标地址采用根资源加子级引用的判别联合，例如 `{ agentId, childRef? }`；子级引用只是定位符，绝不凭它授予权限。最终 wire 引用应可解析而不另建 SQLite child 所有权表，格式随协议 PR 确定并通过伪造/跨根重用用例。

- 先授权根资源，再验证子级所属关系。根失效或删除后，任何后代访问均拒绝。
- 直接目录优先消费 `subagentCatalog`；恢复事实以 descriptor、header 和官方协议为准。不要仅凭可复制的 parentSession 字符串、fork seed 或客户端提供的根路径认定授权。
- 明确 fork 继承事实排除、one-shot/continuable、冷 child 和不存在子级的行为；没有本地 Session 的远程 one-shot 不凭空编造可浏览子级。
- send/cancel 走官方 subagent host 控制协议，用户投递 Queue/Steer 与模型相邻消息区分；不能以通用根 Agent resume 绕过 activation 的准入。
- 以真实官方 provider 测试 MCP、Secret、工具限制与 FS scope 的传播。对没有覆盖的委派 backend 默认不声明支持；发现父级租户能力未传播时，在官方 child setup/provider seam 修正组合或拒绝该 backend。
- 验证父级 delete/revoke/shutdown 对驻留子树的取消和释放；目录仍存在不代表活动授权仍有效。Agent Teams 不默认加载。

涉及 `targets.ts/subagents.ts`（建议内部模块）、B 的控制入口、C 的投影和 Web adapter。测试根/child/fork 三种关系、同租户两位 Principal、跨租户同名 MCP、冷恢复、恶意 childRef 和撤销竞态。不得替换真实子代理 factory 来声称委派验证通过。

## E：交付与文件

读取官方 `deliverables/presented` 事实，用“授权目标 + event seq + file index”定位交付项；校验事件类型、索引和目标后，从服务端取路径，不接收任意 path 参数。公开地址不是 bearer capability，每次 GET/HEAD 都重新建立 Principal 授权。

- 通过目标 Session 的 scoped FS/provider 解析路径，支持父级/child/冷 Session。运行分区不支持安全冷文件读取时明确返回 capability unavailable，不偷偷恢复 Agent或使用 host 全局 FS。
- `present` 指向源文件当前内容；改写后读新内容，文件删除后报不存在，不承诺归档或不可变下载。
- 校验 symlink、目录、越界路径、文件大小和 abort；路径是否允许由租户 FS policy 判断，不能只用 cwd 前缀替代授权。
- 限定所需 GET/HEAD 与下载/预览行为，落实 MIME、no-store、nosniff、下载名及 HTML/SVG 的受限展示；请求关闭即释放文件流和租约。
- 根删除或授权撤销后终止活动响应；已发送字节无法撤回。Secret 的刷新不自动等同于文件权限变化。
- 不暴露服务端默认应用打开/系统文件管理器等桌面特权操作为公共租户接口。

验收真实临时 FS + HTTP：跨根/跨 Principal 交付项拒绝、伪造索引拒绝、父子 scope 正确、文件变化/缺失、symlink policy、传输中取消、冷读取无 Agent 激活。

## F：可选原生接入与完整验收

交付显式安装的 profile/bundle 示例及最小官方 `sidebar.panellist/main` slot 扩展，展示资源列表、控制状态、子级和交付入口。沿用官方协议语义，不复制聊天状态机；完整原生聊天面板的复用必须先证明其请求链都有 Principal 绑定。

枚举入口：CRUD、prompt/cancel、read/follow、child、file、连接重建与错误响应。settings/plugin inventory/原生打开/未授权 stock API 不能因集成 UI 顺带公开。官方 slot 和 Connection 若无法在共享 Host 中安全携带 Principal，先交付限制范围的认证 adapter 示例，记录具体阻塞点；不把未验证的完整官方 UI 标记为完成。

开发验证使用宿主测试认证；demo cookie 不充当生产认证。真实浏览器覆盖两位同租户用户和跨租户用户的发送、运行中停止/插话、刷新恢复观察、子级访问、文件交付与越权。上游新 release 出现时只记录差异，不自动把目标从 rc.2 漂移出去。

## 合入与发布要求

每项实现更新受影响的双语 README、错误语义、宿主协议和打包消费者。Schema 可改；发布说明如实描述需要重建的数据或配置，不为了避免破坏而保留旧实现。

各 issue 的完成条件是对应实现、负向用例、原生证据和文档已合入；创建分支、类型通过或临时实验不等于完成。A/B 必须分别给出失败清理和并发证据；C–F 在能力未安装或 provider 不支持时明确拒绝。

基础发布可在 A 完成后进行。功能发布按已完成范围确定版本，不把未完成的观察/子代理/文件/UI 写成已支持。npm/tag/Release 发布遵循现有手动流程，创建这些 issue 不触发发布。

## 首个开发步骤

从最新 main 创建 `gs-codex/align-dsh-015-rc2`，先实施 A；将评估探针从临时副本整理为正式回归，完成两套 Node 门禁后提交聚焦 PR。随后以 B 的协议和确定性竞态用例为起点推进运行控制重构。
