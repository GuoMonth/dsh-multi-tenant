> Archived snapshot; not current requirements. See the documentation index and active Issue for current scope.

# DSH 0.1.5-rc.2 对齐与架构评估

评估日期：2026-09-11。项目起点：`cff95c6c77e8d7f8d7b38c2c8be0b11ff577905a` / `dsh-multi-tenant@0.5.0`。目标：DSH `0.1.5-rc.2` / `fb2c4b9e698e30edb738bca4cf0618587db7d203`。

本文保留实施前的源码审查、临时实验和设计建议快照；其中“当前”指评估起点。实施已在 #57 推进，最终状态见 development-plan 与验收记录；未执行 npm 发布或部署。设计以当前目标版本的最佳实现为准，不承诺旧 API、旧 schema 或旧 DSH runtime 的兼容，不以历史投入作为保留理由。

## 结论

1. **基线切换本身很小。** 临时副本只更新依赖、overrides 和 DSH target，生产 TypeScript 源码零修改，原有 62 项测试通过。Agent registry、AgentLoop、Tools、SessionQuery 和 Connection 的源码在两个发布快照之间没有变化；不能把 rc.1 汇总发布说明里的全部变化算作本次新增破坏。
2. **值得主动调整的是产品能力边界。** 从仅支持根 Agent CRUD 与回调运行，推进为 Principal 授权下的 DSH 会话控制、只读观察、子代理访问与文件交付。复用官方实现和类型，在对外入口完成授权和必要的字段转换。
3. **先改运行控制的串行粒度。** 实测长 `withAgent()` 回调会阻塞另一个请求中的 cancel。将生命周期切换串行化，与 prompt/steer/cancel 的实时准入、只读观察分开。
4. **保留真正属于多租户的事实，删除重复机制。** 根资源的 Principal 归属仍需独立记录；子代理目录、会话投影、消息调度和文件交付事实已有官方所有者，不再另建同类系统。

## 证据与比较方法

- [目标发布](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.2)；[完整版本比较](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.5-alpha.1...dsh-v0.1.5-rc.2)。GitHub 比较报告 283 个 commit；files API 只返回 300 个文件，因此本次另取精确 commit 的完整源码归档比较，未把 API 文件列表当成完整差异。
- [rc.1 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.1)明确汇总自 `0.1.2-rc.1` 以来的变化；V3、SessionHandle、异步 Agent 创建等在我们当前 alpha.1 基线已存在。
- npm 实验使用确切的 `0.1.5-rc.2`，不通过 dist-tag 解析目标。已有依赖闭包中的 DSH resolution 全部为该版本，没有新增 `@deepseek-ai/*` 包名或改变现有非 DSH 的 `@deepseek-ai/*` 版本。
- 上游 master 查询快照为 `c291e7961a515f6d7af9304e7fd1d257929aef26`，说明为把 release 的反馈与文件改进同步回 master。以下趋势判断以已交付源码为依据，不宣称是官方未来路线图；开放 PR 列表查询返回 404，未据此推断后续承诺。

## 上游方向及本项目判断

### 1. 持久事实、运行实例与观察视图继续分离

官方 Session 保存持久事件，Agent 持有在线活动与 Inbox，projection 和 SessionQuery 提供读取视图。SessionQuery 的 observation 能读取 live 或 prepared Session，冷读取无需激活 Agent，返回可释放的精确事件切面。这是目标版本已有的架构方向，并非本次才新增的 API。

**我们的取舍：** 根资源的所有者和发布状态留在 Directory；会话消息、子代理事实、交付事实交给 DSH。新增历史读取和状态观察时，先以 Principal 授权根资源，再走原生 query/projection。不要为了展示历史调用 `resume()`，不要在 SQLite 再复制会话事件表，也不要直接把全部原始 projection 作为租户响应。

源码：[架构说明](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/docs/architecture.md)、[Session observation](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/session-query/session-query/src/observation.ts)。

### 2. 子代理成为持久、可发现的原生资源

本次新增父 Session 的 required `subagent/catalog` 事件及 `subagentCatalog` projection。创建成功后才追加事实，目录追加失败会释放未交付的子级；fork 投影排除继承来的父级目录事实。child descriptor 仍负责恢复与组合，Activation 与确切 parent 关系仍负责运行授权和消息投递。

需要特别区分：目标源码中的 `listChildren/listDescendants` 仍通过 Session corpus 与子级身份 projection 枚举，不能声称所有发现路径已经消除了全局扫描。官方也明确拒绝另建 SQLite child index，以免多一套写入与对账机制。

**我们的取舍：** 增加“已授权根资源下的子级访问”协议。根资源先绑定 Principal，再验证请求 child 是该根的合法后代；浏览器不能凭任意 session ID 操作 child。读取采用官方目录/查询；消息控制采用官方 subagent 服务，不能把冷 child 当普通根 Agent 直接 resume。MCP、凭据、FS 和隔离如何沿子树生效，必须通过真实委派验证，不能从父子关系推定。实验性 Agent Teams 保持显式组合，不因包已发布就默认启用。

源码：[父目录决策](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/.agents/notes/implemented/architecture/2026-09-01-parent-owned-subagent-catalog.md)、[catalog](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/subagent/subagent/src/catalog.ts)、[现有枚举](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/subagent/subagent/src/list-children.ts)。

### 3. 用户控制需要持续观察和及时准入

官方已有 Session 事件流、控制快照、Queue/Steer 和可继续子代理控制。持久 cursor 与瞬态在线状态分别处理，重连也区分日志补齐和完整 baseline 替换。

当前 `MultiTenantService.withAgent()` 在 `serial()` 内执行整个宿主回调。若回调等待长任务，另一个请求即便只想 cancel 或 steer，也必须等这个回调结束。删除有单独的提前失效路径，不能据此认为普通 cancel 也能及时执行。

**我们的取舍：** 以显式 command 和 observation 为主要接入面，允许删除或重写现有 callback API。create/resume/能力刷新/delete 继续互斥；短命令在校验 live generation、Principal 和撤销状态后准入；耗时等待和观察不持有生命周期串行锁。租约引用、删除 cutoff、刷新时旧 generation 失效和 shutdown drain 仍需一个明确的所有者。不能简单地把 `use()` 移出锁而不设计释放竞态。

上游源码：[SessionController](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/api/session-controller/README.md)。本项目位置：`packages/multi-tenant/src/service.ts` 的 `withAgent/serial/ensureLive/delete`。

### 4. 文件交付是会话能力，路径必须绑定正确的执行环境

`present` 在成功工具结果后追加 `deliverables/presented`。**最终 rc.2 实现引用源文件当前内容，不复制或保留不可变快照。** 部分中间 commit 标题仍写 immutable deliveries，不能作为最终语义。workspace file lookup 能为冷 Session 及 subagent 解析 workspace；接口允许访问 workspace 外路径，实际访问权限属于 FS/provider/policy。

**我们的取舍：** 复用交付事件和官方预览语义；增加 Principal → 根资源/合法后代 → scoped filesystem 的访问链。对外地址应指向已授权资源与交付项，不提供任意 Session ID 加绝对路径的通用读取入口。若要交付归档或永久下载，单独定义产品存储需求，不能把 `present` 描述成已具备此能力。

源码：[present 实现](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/fs/tool-present/src/index.ts)、[workspace file lookup](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/api/workspace-files/src/index.ts)。

### 5. 官方扩展方式是 Cordis 组合和能力提供方

Web 增加 `sidebar.panellist` 与 `main` 全局面板，原 conversation slot 移入 main。Profile/bundle 是官方应用组合入口。Gateway 有 lookup 配置扩展点，但当前浏览器认证授予的是 Host 访问，并未建立我们的 `(tenantId, principalId)`；Connection 源码在这次对比中未变。

**我们的取舍：** 继续作为可安装的 Cordis bundle；需要原生 UI 时开发官方 slot 插件。共享多租户模式的所有入口必须有 Principal 绑定，包括 list/search/follow、子级、文件、事件流和配置操作；仅替换 Agent lookup 不足以完成全面隔离。先用小范围的认证后 adapter 验证所需功能，不能通过暴露 stock `/api` 获得所谓原生对齐。

源码：[Gateway](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/api/gateway/README.md)、[browser auth](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/client/connection/src/browser-auth.ts)、[alpha.2 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.2)。

### 6. 凭据与隔离复用原生能力，租户权威仍由我们补齐

官方 credentials 提供按引用解析、插件记录和更新事件，但方法没有 Principal 参数，也没有我们 SecretLease 的租户作用域与撤销契约。因此不能直接删除 SecretProvider、把全部租户映射到同一个全局 credentials service。

**我们的取舍：** SecretProvider 保留的理由是租户授权和在线能力撤销；实际存储交给宿主或 scoped 官方 credentials adapter。仅在 provider 已绑定正确租户 scope 时桥接引用与更新事件，不自建另一个密钥保险库。RuntimePartitionProvider 的价值是承接宿主执行环境；默认 shared 的逻辑隔离与真实容器隔离分别表述。没有官方实现或实际消费方的分布式控制层不在这次升级中预建。

源码：[credentials](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/credentials/credentials/README.md)。

## 改造清单与顺序

| 优先级 | 工作 | 范围和验收 |
|---|---|---|
| P0：目标基线 | exact peers/devDependencies/overrides、lockfile、DSH commit、当前文档与测试标题 | 只安装 rc.2；Node 22/24 原生生命周期、构建和打包消费通过；正式发布前跑完整 release gate |
| P0：新增回归 | MCP 重复 tools/list cursor | 新 Agent 创建失败、Directory 不公开、Agent handle 释放；官方负责发现算法，我们测试其与 provisioning 的组合 |
| P0：清理门禁 | 移除已退休 v0.3 文件名黑名单、固定文案/源码字符串和重复 export 列表等历史结构约束 | 保留版本身份、依赖闭包、发布产物、真实行为和消费方类型验证；API 改造不能被旧文本布局阻挡 |
| P1：运行入口重构 | `service.ts`、`protocols.ts`、`runtime-driver.ts`、Web command adapter | 持续任务中可及时 steer/cancel；回调/观察不占生命周期锁；delete/revoke/refresh/shutdown 竞态通过 |
| P1：只读观察 | Principal-scoped 原生 query/projection adapter | 冷读不激活 Agent；越权在读取前拒绝；观察可释放；原始内部 ID、路径、跨资源引用逐项决定对外表示 |
| P1：子级权威 | 根资源归属与官方 subagent 访问连接 | 同租户不同 Principal 也不能访问彼此子级；冷恢复、fork、撤销、父级删除、MCP/FS scope 有真实测试 |
| P2：交付与文件 | 认证后交付/文件 adapter | 当前源文件语义明确；父/子/冷 Session 绑定正确 FS；拒绝越权路径与跨资源引用 |
| P2：原生体验 | 可选 profile 和官方 Web slots | 不复制官方聊天状态机；按实际产品入口验证授权，尚未全面授权的 stock API 保持管理用途 |

推荐先把 P0 与运行入口重构做成可独立验收的变化，再连接只读观察和子级。P1/P2 是依据产品方向提出的主动改造，不是 rc.2 编译所必需；不能把“未来值得做”写成“当前已阻断升级”。如果只发布基线替换，版本可推进为 `0.6.0`；若同时重定 API，以最终改造范围重写发布说明，不保留弃用转发层。

当前 bundle 的 `cordis.patch.yml` 首行仍标注 DSH `0.1.2-rc.1`，正式对齐时应删除这条重复版本注释或改成不含版本的用途说明。模型 adapter 默认路由新增 `deepseek-flash`；当前插件不直接加载该 adapter，具体模型变化取决于宿主组合。显式配置的 provider/model 不应在对齐时被强制覆盖。

## 保留、替换与不建设

- **保留 Principal 授权与根资源 Directory。** 这是上游父子关系、Session writer lock 和 Host cookie 没有提供的权威。可以重命名、缩小记录或改 schema，保留理由不依赖 API 连续性。
- **保留创建前的 session flush。** rc.2 Agent/AgentLoop 未改变；空会话重启探针仍通过，不应移除已证实必要的发布条件。
- **替换长 callback 独占运行模型。** 原生控制语义与实时产品操作应成为设计输入。
- **不复制 subagent catalog、消息 Inbox、projection、持久日志迁移和文件交付事件。** 使用官方服务，补租户授权。
- **不为所有旧 DSH 版本做适配，不构建多 runtime 分支或旧 API façade。** 测试证明当前目标行为，历史格式与回滚不作本项目承诺。
- **不因升级顺便开发分布式调度器、容器平台或完整聊天前端。** 这些需要明确消费场景，与本次 rc.2 接口对齐分开。

## 实验记录

实验副本从项目 HEAD 导出到 `/tmp/dsh-mt-rc2-assessment-20260911`。首先仅更新 `packages/multi-tenant/package.json`、`pnpm-workspace.yaml`、`scripts/dsh-target.mjs`，运行非冻结安装生成新 lockfile，再验证冻结安装。生产 `src/` 没有修改。

| 检查 | 结果 |
|---|---|
| Node 24.18.0 / pnpm 11.7.0：初次安装与随后 frozen install | 通过，保留 1,440 分钟 release-age 和 exact exceptions 策略 |
| 原有测试 | 5 个文件、62/62 通过 |
| typecheck / build / peer check | 通过；build 在安装 prepare 中执行 |
| SQLite restart/CAS/默认权限探针 | 通过 |
| 安装后 tarball consumer 与类型检查 | 通过；这是临时 0.5.0 元数据产物，未发布 |
| package/contract verification | 通过 |
| 新增两项评估探针后，Node 24.18.0 | 64/64 通过 |
| Node 22.19.0：64 项测试与 typecheck | 通过 |

新增探针一：真实 stdio MCP fixture 的 `tools/list` 始终返回相同 `nextCursor`。rc.2 在创建期间拒绝；Directory 中记录为 failed、公开列表为空、原生 Agent registry 中无残留 handle。这验证初始发现失败与我们的清理路径，未额外测试已有 MCP 连接的后续重新发现失败。

新增探针二：保持一个 `withAgent()` 回调 pending，再发起第二个 `withAgent()` 内的 cancel。经过一个事件循环后 cancel 尚未进入；释放第一个回调后 cancel 才执行。这证明当前锁粒度与即时控制冲突，探针记录现状，不意味着现状是未来期望。

实验没有执行付费模型、完整官方 profile/UI、真实 subagent 委派或文件下载链路，没有跑 rc.2 的 GitHub CI、完整本地 release:check 或发布流程。完整 release gate 还包含当前版本文档与发布身份要求，应在正式实施时更新后执行。62 项既有测试通过不能外推为所有官方扩展均已实现多租户隔离。

## 目标结构

```text
宿主认证
  -> Principal + 已授权根 Agent 资源
     -> 生命周期管理：create / activate / refresh / delete
     -> 实时控制：prompt / steer / cancel
     -> 只读观察：原生 SessionQuery + projection
     -> 子级访问：根归属校验 + 原生 subagent 协议
     -> 交付访问：会话归属校验 + scoped filesystem

根归属与发布状态：本项目 Directory
消息、父子事实、交付事实与恢复：DSH
认证、密钥后端与真实执行隔离：宿主提供方
```

上述是建议实施的结构，不是对当前已交付能力的描述。
