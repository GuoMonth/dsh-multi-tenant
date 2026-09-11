# #68 / #71 原生集成重构评估与对抗性审查

日期：2026-09-11。状态：架构评估与原生双 Host 最小技术验证通过，尚未实施产品重构；本文件不宣布 Issue 完成。

## 结论

建议把 #68 与 #71 合为一条“原生 DSH 授权域”工作主线。首先证明授权域和官方宿主的对应关系，再决定代码结构。继续在 `agent/created` 补 scope、复制子级 MCP、复制 Web 控制器，都不应成为主线。

在“优先复用官方完整 Web，允许破坏旧 API”的目标下，优先验证 **一个独立授权域对应一个原生 DSH Host**。最初授权域按 `(tenantId, principalId)` 划分；同租户内两个 Principal 仍然隔离。DSH 负责域内的 Agent、preset、子代理、Session、Web；本项目负责认证、授权域选择、域生命周期与宿主能力配置。

这是基于当前源码的工程建议，不是 DeepSeek 宣布的多租户路线。它也改变了本项目“单个共享 Host 内的多租户插件”这一默认集成方式：需要部署宿主与入口层，不能把进程隔离说成一个 npm 插件自动提供的能力。如果必须保持“一个进程、一个完整官方 Web、多个互不信任 Principal”，应选择上游扩展协作路线，而不是声称现有 rc.2 已经足够。

不建议立即全量重写。真实 preset 委派/冷恢复与官方 Web 双 Host 的最小原生验证现已通过，见[技术验证报告](../evidence/native-domain-review/multiprocess/REPORT.zh-CN.md)。可以开始按新所有权结构形成重构的纵向切片；平台身份路由、撤销、单 writer 和完整授权覆盖仍是交付门槛。不保留旧 API 兼容层，失败时根据证据修订架构。

## 证据身份与可信程度

| 对象 | 本次核对身份 |
| --- | --- |
| 本项目 | `main`，`ffee4840d8e7a79c0065556b8b31f76465708fc4`，源码版本 0.6.0 |
| 最低兼容基线 | DSH `0.1.5-rc.2`，`fb2c4b9e698e30edb738bca4cf0618587db7d203` |
| 上游发展观察 | `master`，`c291e7961a515f6d7af9304e7fd1d257929aef26` |
| 发布查询 | 最新发布仍为 rc.2，发布时间 2026-09-10 15:09:34 UTC |
| 分支关系 | GitHub compare 显示 master 相对 rc.2 ahead 139 commits；这不是 139 项发布后新增功能 |

依据包括官方源码、已实现设计记录、release notes，以及社区 Discussions。上游当前关闭 GitHub Issues，社区建议通过 Discussions 提交。抽查的多租户讨论未见 MEMBER/OWNER/COLLABORATOR 身份的架构承诺；这只描述本次读取的评论范围，不能据此断言官方内部没有相关计划。

证据优先级：固定 commit 的实现与行为证据 > 对应版本契约 > 已实现设计记录 > 社区提案。部分 Agent Note 保留了演进早期的描述，例如“每 Agent 挂载 preset”；当前 rc.2 实际采用 standing mount，不能只读旧设计动机而忽略实现。

## 已有上游方向，以及对我们的约束

1. **插件组合和明确的能力所有者。** 官方架构由 Cordis Service、typed event 和 effect 构成；preset 选择模型能力，宿主提供跨会话基础服务。我们应复用这条装配链，不建立平行 Agent registry、continuation manager、工具路由或 UI 状态机。[官方架构](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/architecture.md)
2. **preset 是可共享的能力组合，不能被直接当作认证边界。** `mount` 和 `composeFrom` 让根和子级加入 standing scope；重组权限由 AgentPresets 独占。跨会话 projection 等服务仍在 host plane。[Host/Agent 平面决策](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/.agents/notes/implemented/architecture/2026-08-10-host-plane-ownership-after-presets.md)
3. **原生 Web 使用类型化 Remote 和独立传输载体。** unary、stream、原始 Fetch 和主动事件各有边界。可配置 lookup 是现有扩展点，但并不是完整授权横截面。[Gateway 契约](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/api/gateway/README.md)
4. **Session 的持久事实、投影和受控历史读取继续分离。** master 已将 `eventAt`、`snapshotEvents`、`ownEvents` 标记 deprecated，禁止新增生产调用。方向是避免要求整段历史同步驻留内存；尚不能宣称 resume/fork 已全部完成渐进读取。我们应沿用原生 query/projection，不为业务判断增加全历史扫描。[已实现读取决策](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md)
5. **快速演进允许破坏 API。** rc.1 发布说明包含 SessionHandle、异步 Agent 创建、显式 Agent 参数、Web slot 调整等变更；它们不能全部误算成 rc.2 新变化。我们的发布仍固定一套已验证 npm/commit 身份，最低 rc.2 不代表任意未来版本天然兼容。[rc.1 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.1)、[rc.2 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.2)

master 与 rc.2 的定点 diff 显示：本次关注的 `scope/src`、`agent-presets/src/mount.ts`、`subagent/src/child-agent.ts`、Gateway host `index.ts`、Connection host `index.ts` 没有差异。preset `index.ts` 有默认选择策略变更，但没有解决本报告中的组合和身份边界。不能用浮动升级代替设计。

社区已有[原生多用户诉求](https://github.com/deepseek-ai/deepseek-harness/discussions/2679)、[SSO 后的会话可见性提案](https://github.com/deepseek-ai/deepseek-harness/discussions/3389)、[会话级 MCP 讨论](https://github.com/deepseek-ai/deepseek-harness/discussions/4694)。这些证明需求存在，不是官方接受方案的证据。

## #68：根因是两种不同的关系被塞入一个父链

当前插件在根 Agent 的 `setupMcp` 中安装 Principal MCP，再在 `agent/created` 中把子级接到父 Agent。它仅在子级尚未有 scope parent 时成立。[本项目 runtime-driver](../../packages/multi-tenant/src/runtime-driver.ts)

真实 preset 装配的关系是：

```text
父 Agent 自身层 ──→ preset standing 层
子 Agent 自身层 ──→ 同一个 preset standing 层
```

子级继承的是相同 preset generation，不是父 Agent 自身层。源码链路：

- [`applyChildComposition`](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/subagent/subagent/src/child-agent.ts) 在新建与冷恢复装配中调用 `composeFrom`，然后安装 child persona/toolFilter。
- [`AgentPresets.mount/composeFrom/recompose`](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/preset/agent-presets/src/index.ts) 私有持有 parent binding，保证子级加入父级当前的 exact generation。
- [`bindScopeParent`](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/core/scope/src/index.ts) 拒绝第二次 bind。
- [`standingMountFor`](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/preset/agent-presets/src/mount.ts) 只匹配 Agent 的直接父 scope。即使能插层，preset discovery、service resolution 也必须共同适配。
- [`ToolRuntime.view`](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/core/tools/src/index.ts) 对 inherited 工具应用限制，再加入 own 工具；后者按设计不受 inherited filter 限制。

因此三个捷径均不成立：再次 bind；对子级复制 MCP；向所有 Principal 共享的 preset 注入某个 Principal 的 Secret。第三种会把秘密与能力的所有者错误扩大到整个共享组合。

建议原生授权域路线：将域允许使用的 MCP/工具装入该域的受管理 preset composition，让官方 `mount → composeFrom → cold continuation` 自然延续同一能力组合。Secret 只在该域内解析，禁止写进可被其他域读取的共享 preset/config。不要为了继承方便把所有模型工具改放 host global 层。

这只解决域级能力组合。若要求同一个 Principal 的不同根 Agent 拥有不同不可扩权的 grant，应额外保留明确的 root grant/revocation 契约；不能把它默默放宽成整个 Principal 的能力并集。FS、模型凭据和其他 provider 也必须纳入授权域，不能只隔离 MCP 名称。

如果走共享 Host 路线，应向上游提出组合扩展的语义契约，而非先规定私有实现：在 publication 前安装可信的 effective composition；根、子级、冷恢复统一消费；保留 preset identity/generation、过滤规则和单一重组所有者；共享 standing state 不混入 Principal Secret。是否采用 domain-specific standing composition 或正交 capability layer，应由真实用例和上游维护者共同决定。当前没有现成 API 名称可承诺。

## #71：授权缺口跨越调用、数据源和主动推送

rc.2 [`InvokeRemoteRequest`](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/api/gateway/src/types.ts) 包含 namespace、method、args、signal，没有可信 Principal。`TypertLookupResolver` 接收 wire identity，而不是完整的请求身份。`@RemoteScope` 用于解析运行时 Context，不能将其 wire id 当成登录凭据。

此外，Gateway 的 `broadcastRemoteEvent` 遍历所有 Remote event clients；scoped waterfall 的 pending delivery 也投递到已连接 clients。框架在此假定它们属于同一宿主授权范围。普通查询过滤不覆盖此类数据和交互流。[Gateway 实现](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/api/gateway/src/index.ts)

| 必须覆盖的入口 | 当前依据 | 所有权要求 |
| --- | --- | --- |
| Session list/search/create/page/follow/queue/cancel/fork | `api/session-controller/src/index.ts` | 数据源与 mutation 都只触及已授权域；不能只替换 Agent lookup |
| Workspace 列表、排序、关联、归档、目录选择 | `api/workspace-controller/src/` | Workspace、Session 归属一致，宿主目录不能被任意选择 |
| `$events`、审批/交互结果、重连 replay | `api/gateway/src/index.ts`、`api/remotes/src/index.ts` | 事件接收人、结果提交人和连接 generation 均需绑定身份 |
| `/api/file` 的 GET/HEAD | `api/session-controller/src/media-references.ts` | 此入口直接按绝对路径使用 host `ctx.fs`，必须有真正的 FS 边界 |
| 文件上传、workspace-files、日志导出 | `client/file-upload/src/`、`api/workspace-files/src/`、所选 profile 导出路由 | 流、临时文件、最终路径与取消清理均留在授权域 |
| Settings、credentials、preset authoring、plugin inventory | 对应 Remote services | 区分域用户可修改数据与平台操作权限；列表也可能暴露宿主信息 |
| 桌面 opener/reveal、插件提供的额外路由 | host capability 与 WebServer route registration | 云端能力由 profile 明确决定；新增路由不能绕过入口层 |

这是一份源码审查覆盖表，不是已经枚举并运行全部 profile 路由的测试清单。实施时从实际装配生成路由/Remote inventory，覆盖 WebServer 直接注册、Fetch、unary、mux、event result，未知入口在准入时失败。

两个可成立的方向：

**共享 Host：** 上游需要可跨 unary、Fetch、mux logical stream、server-push 与 response 保持的可信调用上下文，以及数据所有者提供的 policy seam。身份由认证载体产生，不进入模型/浏览器可伪造的 args。query provider 必须能在列表、搜索、分页、计数前限定授权资源；结果后过滤既可能泄露元数据，也可能破坏分页。AsyncLocalStorage 可以是某个 carrier 的实现细节，不能代替公共身份契约；在 WebSocket 后续消息与异步迭代器上尤其不能假定上下文自动保留。

**独立授权域 Host：** 入口认证后只将连接送到该身份可访问的 DSH Host，域内原生控制器天然只拥有该域数据。HTTP、mux、主动事件和静态 client graph 使用同一版本、同一 Host。这样避免重写每一个官方业务控制器，但仍需证明 OS/FS/网络、browser auth 与连接撤销边界。

## 方案比较

| 方案 | 官方能力复用 | 外部依赖/成本 | 结论 |
| --- | --- | --- | --- |
| 继续扩充受限 REST + iframe | 主要复用底层 Agent，前端长期分叉 | 成本随功能增长，持续维护映射 | 可保留为迁移期证据，结束后移除；不作为完整 Web 主线 |
| 共享 Host 内逐控制器包装/替换 | 表面保留 UI，内部行为易漂移 | 每次上游新入口都需追补 | 不推荐 |
| 共享 Host + 上游组合/授权 seam | 长期可保持轻量插件定位 | 涉及多个上游所有者，尚无接受或交付承诺 | 若单进程多 Principal 是硬要求，这是合理路线 |
| 独立授权域原生 Host + 入口/生命周期层 | 复用完整域内 DSH，边界更贴近当前 Host 所有权 | 进程/隔离资源、启动延迟、域调度、凭据桥接 | 对当前功能优先目标，推荐先验证 |

不把“每个授权域一个 Host”等同“每个请求/每个 Session 一个容器”。域可以拥有多个原生 Session，按需启动，空闲回收；这些需要测量，不能预填一个没有证据的并发容量。也不在本轮引入计费、分布式调度或通用容器平台。

## 推荐路线的对抗性审查

以下是对候选方案的独立反向审查轮次，不是多名审查者投票，也不是已复现的公网漏洞。优先级描述的是方案实施后的风险。

| 等级 | 反例/攻击路径 | 对方案的修正与验收 |
| --- | --- | --- |
| P0 | 一个 Tenant 的 Alice 与 Bob 被分配到同一 Host | 初始域键包含 tenant + principal；团队共享要另有显式成员授权模型 |
| P0 | 两个 Context/进程共享 DSH_HOME、cwd、OS 用户可读目录或平台环境变量 | 独立 Context 仅证明注册表分离；不能代表恶意代码隔离。用受限执行身份/容器、独立存储和最小环境证明域边界 |
| P0 | 已登录 A 的浏览器修改 host/domain id 进入 B | 路由目标只能来自服务端授权解析；浏览器 domain id 仅为待验证选择；后端不可直接访问 |
| P0 | 仅在 WS upgrade 校验身份，登出后旧连接继续收到事件或提交审批 | 身份/成员资格/域 generation 撤销要关闭现有流并拒绝迟到消息；重连重新认证 |
| P0 | 代理默认透传用户 cookie、DSH launch token、任意目标地址 | 外部身份和内部 DSH browser auth 分开；代理不接受用户提供后端地址或内层凭据；token exchange、Host/Origin、cookie 路径必须有真实测试 |
| P0 | 同租户子域 cookie、共享 origin 的 HTML/缓存把 A 会话带到 B | 优先每域独立 origin；验证 host-only cookie、跨 origin 拒绝、缓存和 service-worker 范围、HTML/下载行为；域同站点不等于无跨域风险 |
| P0 | 用户通过 preset/settings/plugin 让域读到平台管理秘密 | 用户域不得拥有平台秘密、管理 socket、广泛文件挂载；在模型中明确域用户的配置权限。任意插件代码默认不是可信授权策略 |
| P1 | 根撤销只做 `cancel`，子级冷恢复或后台 MCP reconnect 继续工作 | 拒绝新 admission，再停根及后代、释放资源；对 root tombstone 及冷恢复做持久化验证。native archive 不能自动等同授权删除 |
| P1 | Principal 全局 MCP 使原来的每根 grant 被扩大 | 明确域级与 root 级 grant，拒绝能力并集；有区别的根 grant 必须另行验证 |
| P1 | 将 current preset id 当成 generation，冷恢复误用后来修改的组合 | 原生语义内验证运行中 exact generation 和重启后重新装配；不承诺上游本身没有的跨重启 generation 永存 |
| P1 | 旧 Host 未停完就把同一可写数据交给新 Host | 域只有一个 active writer owner；关闭失败时禁止新 writer 激活，或由真实存储 fencing 阻止旧 owner；单 Session 锁不是域锁 |
| P1 | 一个 disposer 失败导致后续租约未释放，原始失败被吞 | acquisition 立即有 owner；所有释放都尝试，聚合原始/清理失败；在异常与并发 shutdown 下计数验证 |
| P1 | upstream 新增 Remote/plugin route 后静默可用，提升平台能力 | 对实际发布的 profile 和版本建立 inventory 差异门禁；域内新增普通功能可复用，新增宿主能力必须重新审查 |
| P2 | 每域 Host 的内存或冷启动不可接受 | 实测冷/热启动、空闲 RSS、活跃 Session/域增长、回收后残留；结果决定是否需要共享 Host 上游路线 |

官方明确说明沙箱与审批不是隔离保证，因此域隔离不能单靠 prompt、工具可见性或 DSH 沙箱配置。[官方安全边界](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/SAFETY.md)

一个重要反驳成立：独立域 Host 消除了跨 Principal 共享许多对象的问题，但**没有自动解决域内每根撤销、客户端凭据桥接、资源效率或平台权限隔离**。因此本报告推荐先做验证，而不把这条路线写成已完成的安全架构。

## 应形成的职责结构

```text
宿主认证/成员资格
        ↓
服务端解析授权域 + 可撤销的连接准入
        ↓
域运行时 provider：启动、就绪、失效、停止、单 owner
        ↓
该域的原生 dsh profile
  ├─ 本域 credentials / FS / Session storage / query
  ├─ 受管理 preset → 原生 Agent / 子代理 / MCP
  └─ 同版本官方 Web / Remote / Fetch / events
```

包拆分由真实消费者决定。先在一个仓库保留入口、域 provider、native profile 和集成测试的清晰模块边界；只有需要独立安装/演进时才拆 npm 包。域 provider 提供进程或容器实现，不复制 DSH Agent lifecycle；Cordis effect 管理本项目注册和撤销，进程 supervisor 管理进程边界。

现有实现的处理：

| 当前部分 | 重构决策 |
| --- | --- |
| `runtime-driver.ts` 的子级 scope 接线 | 在真实 preset 路径验证后删除 |
| `MultiTenantService` 的 runtime/reader/child/file 聚合 | 按授权与运行时 owner 拆解，域内业务委托原生服务；不把原函数原样换目录 |
| `TenantAgentRepository` | 重新确认哪些归属与撤销事实仍由项目拥有；可能收缩为域目录及明确 root grant，不能重复存一份原生 Session 事实 |
| 自定义历史/文件 UI 协议与 iframe panel | 完整原生 UI 达标后移除，保留必要的登录/域选择扩展 |
| MCP 配置、Secret、Principal 协议 | 保留它们的业务要求，重新归属到授权域；旧 public API 不强行保留 |
| `subagent/internal` import | 目标是由官方 UI/Remote/原生 runtime 消费；确需外部入口时争取公开 seam，避免扩大内部依赖 |
| 原有失败与越权测试 | 按用户可见不变量迁移；不为已删除类保留测试，也不因类删除丢掉反例 |

## 推进顺序与停止条件

### 阶段 1：真实 native preset 最小验证（#68）

在独立实验装配中使用精确 rc.2 的真实 AgentPresets、Loader、MCP、AgentLoop、spawn/fork、JSONL。使用 keyless model 与本地 MCP，不触发外部业务。

验收：

- 两个 Principal 的同名 MCP 工具，根/子/孙级只读取本域测试秘密；直接工具调用与模型 schema 都不越权。
- 原生 toolFilter、persona、FS policy 与同名 shadow 组合；子级不能靠 own-layer 复制获得被禁止的工具。
- 新建、blank preset switch、one-shot fork、continuable spawn、冷恢复、进程重启全部覆盖。
- 根 grant 撤销及 Principal 撤销，分别验证 admission、进行中调用、后代、reconnect 与持久恢复。
- 不读取/改写 AgentPresets 私有 binding，不复制 continuation manager，不截获未验证的 publication 路径。

停止条件：只有通过篡改原生所有者或复制上游控制流才能实现时，记录最小反例和所需上游 seam；不能把实验补丁提升为主线。

### 阶段 2：完整 native Web 双域验证（#71）

通过受支持的 `dsh` profile 启动两个实际 Host，使用其同版本原生 client graph；实现最小认证/代理边界。先以本地受控环境验证，不部署公网。

验收：

- 不用受限 panel 替代官方聊天；原生会话列表、搜索、历史、实时输出、queue/steer/stop、子代理、文件上传/下载都可用。
- 分别用两个浏览器上下文和直接协议调用检查跨域 IDs、路径、host、cookie、mux stream、event result。
- 覆盖登出、授权撤销、账号切换、多标签页、重连、迟到响应、旧 generation、Host 崩溃和恢复。
- settings、preset authoring、inventory、desktop 能力明确记录为允许、域内受限或产品不提供；不能以 CSS 隐藏代替服务端约束，也不能将云端无桌面能力误报为功能完成。
- 枚举实际 profile 的入口，所有外部入口经过同一授权域准入；域内服务无跨域可访问的数据或平台管理权限。
- 得出资源与启动测量结果，验证停机释放和单 active writer。

停止条件：需要 fork 大量官方 client/controller，或者认证/存储边界无法闭合时，返回共享 Host 上游协作路线评估，不继续扩大代理的业务语义。

### 阶段 3：按事实替换主线

以前两阶段可执行行为为规格，删除 superseded runtime/UI/旧契约，形成面向开源使用者的安装与双语边界文档。保持精确 rc.2 发布身份；另设上游 master 的观察性验证，观察失败不自动改变已发布支持范围。

public surface 变更运行 packed consumer；Node 22.19/24 发布矩阵运行真实 native integration、关键浏览器验证、failure injection 和现有 `pnpm release:check`。不要把本轮现有 78 个测试通过当作新架构通过。

阶段 1/2 可以各自形成明确里程碑，但 Issue 关闭要看语义验收，而不是目录重命名或探针通过。重构后的语义若改为“独立域 Host 支持”，必须同步改写 #68/#71 的范围说明，避免暗示已经支持共享 Host。

## #65 在新主线中的处理

不单独保留 `ensureLive` 修补方案，不要求新架构继续按每次操作获取一组新租约。但不把“旧函数被删”当作资源泄漏已经解决。

新的 owner 必须保证：资源获取返回后立即受失败清理保护；发布前失败释放新资源；旧资源释放失败不能允许双 writer；一个 disposer 抛错后仍尝试其他释放；shutdown 与 late acquisition 竞态可收敛；错误同时保留业务失败与清理失败。采用标准资源栈/结构化 try-finally 或 Cordis effect 时，也需匹配 Node 22.19 的真实可用 API。

相同失败注入反例在新边界通过，且旧路径确实被删除后，才可将 #65 标为“随重构解决”；当前仍应保持 open。

## 补充：每 Principal 多进程与私有文件区域

针对后续讨论，建议把候选实现进一步收敛为：一个 `(tenantId, principalId)` 对应一个持久私有数据区域，以及至多一个活动的原生 DSH Host 进程树。进程可按需启动/回收，文件区域独立于进程存活。一个 Host 可运行多个 Session；DSH 与 MCP 派生的子进程也属于该域，不要求系统中严格只有一个 PID。

单机第一版只需要三个责任主体：

1. **入口**：认证、域选择授权、HTTP/WS 代理、连接撤销。它不翻译 Session 或工具业务协议。
2. **运行时管理器**：合并同域并发启动、就绪探测、单 owner、退出/崩溃处理、空闲回收、资源限额和进程树清理。空闲必须考虑后台任务、子级和持久化，不能只看浏览器是否断开。
3. **原生 DSH Host**：本域的官方 Web、preset、Agent、子代理、Session、query、MCP 和文件服务。

数据布局示意（不是已创建的服务器路径）：

```text
domains/<opaque-domain-id>/
  dsh-home/       # 本域 DSH_HOME；原生配置、凭据、历史和索引按 profile 落位
  workspaces/    # 用户项目文件，可包含多个项目
  tmp/           # 本域临时文件
  logs/          # 本域运行日志，访问受限
```

域 ID 由服务端映射生成，不直接把用户名拼到路径。统一版本的 DSH/Node/依赖可作为只读程序文件或容器镜像共享；不得共享可写的用户配置、credentials、session/query 数据及上传临时目录。平台自己的管理数据库和管理秘密放在 worker 无权访问的位置。

rc.2 已支持 `DSH_HOME`，但显式配置路径优先级更高；它不能自动约束任意插件路径、OS home、Shell 或 MCP 文件访问。需要核对实际 profile 中持久化 root/query path，并以本域工作目录启动。启动环境按允许列表构造，避免继承控制进程的秘密；DSH 会加载启动项目与自身 home 的环境配置。[原生 home 解析](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/util/home-paths/src/index.ts)、[启动环境装配](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/boot/app-boot/src/index.ts)

**目录划分与访问隔离是两件事。** 同一 OS 用户下的两个 Node 进程仍可读取彼此有权访问的目录；`chmod 700` 无法区分同一 UID 的进程。可信本地开发可用普通子进程证明功能；互不信任的用户运行 Shell/MCP 时，部署实现必须加上独立 OS 身份和必要的文件/网络限制，或采用受限制的容器。container/worker 不应访问其他域的内部端口、平台管理入口或管理 socket。

#68 的能力应进入域内受管理 preset，再通过原生委派继承；仅拆进程而保留父 Agent 私有 MCP 的现有装配，仍会遇到同一个 scope 问题。#71 的跨 Principal 数据隔离可主要由正确路由和私有数据源实现，原生 browser auth、服务端事件与撤销仍要贯通。每根 Agent 的特殊授权撤销和跨 Principal 协作不因此自动获得。

首个验证样例现已启动 A/B 两个真实 Host：同名 MCP、不同合成标记、独立文件；在官方 Web 实际交互，并通过原生协议验证子代理、相互隔离、停止/重启、冷恢复和 idle SIGKILL。资源测量与限制见[技术验证报告](../evidence/native-domain-review/multiprocess/REPORT.zh-CN.md)。这些最小进程集成检查不代表平台授权入口或空闲回收已完成。

## 本轮执行证据与未验证项

已执行：固定版本源码与关键差异审查；当前 Issue/发布/社区讨论查询；[Scope 反证脚本](../evidence/native-domain-review/scope-contract-probe.mjs) 的四项断言全部通过。

```sh
node docs/evidence/native-domain-review/scope-contract-probe.mjs
```

该脚本使用本项目安装的真实 rc.2 Scope/ToolRuntime，以最小对象作为 scope key，验证 sibling join 不继承父 overlay、重复 bind 被拒绝、own 工具绕过 inherited filter、独立 registry 的同名隔离。**没有启动真实 AgentPresets、完整 Agent lifecycle、容器或官方 Web**，所以它是机制反证，不是阶段 1/2 的完成证据。

随后新增[原生双 Host 探针](../../scripts/native-host-probe/README.md)，使用真实 rc.2 Web profile、AgentPresets、MCP、子代理与存储；最终 18 组集成检查通过。它使用独立锁定的测试依赖，结果、截图及尚未覆盖的阶段 1/2 条件见[报告](../evidence/native-domain-review/multiprocess/REPORT.zh-CN.md)。

开发环境准备阶段已运行类型检查、78 项现有测试、`pnpm verify`，依赖安装触发的构建通过。新增评估文档、独立实验依赖与探针，没有修改产品源码、主项目依赖/根锁文件或上游源码。
