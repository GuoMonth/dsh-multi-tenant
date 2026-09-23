# Agent Workspace 对抗审查与裁决

> 历史审查保留当时命名与实现选择。2026-09-23 起使用 [AgentEnvironment](../design/agent-environment.zh-CN.md)，控制器选型见 [agent-sandbox 评估](../design/agent-sandbox-evaluation.zh-CN.md)。

2026-09-22，主线 [#104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104)，最终[设计契约](https://github.com/GuoMonth/dsh-multi-tenant/blob/844eb977fa352981a134a6726067aa43bf9709b6/docs/design/agent-workspace.zh-CN.md)。这是架构/源码只读审查，未运行新架构、启停、OAuth或性能回归。

## 审查来源

- 两位 `gpt-5.6-luna` 分别审查平台与runtime源码；平台基线 `8177994d15713422d5505f475a80eedfc0b257bf`，runtime `75cb35af51b7c60c6e4f9c9335a935b4ccbb68a0`。负责列出可删除入口、资源权威和范围反例。
- Claude Code `2.1.278` 独立审查方案和修订稿；本机实际模型为 `deepseek-flash[1m]`（DeepSeek Anthropic-compatible endpoint），**不是Claude模型**。工具/MCP禁用，只提供脱敏的架构事实与设计稿；它没有直接检查仓库或运行测试。
- 主线程核对源码与Kubernetes文档，裁决审查意见；审查意见不是事实证明。原始输入/输出保留在任务台账的evidence目录，公开记录只保留必要结论，不含私有配置或凭据。

## 已采纳

| 意见 | 事实与处理 |
| --- | --- |
| 保留薄资源聚合，不保留多后端产品 | Workspace统一身份、计算/存储生命周期有当前需求；CRD/Operator付出部署/排障成本但不扩展成调度器。直接STS/PVC由runtime管理同样合法，保留Operator是取舍而非技术必然 |
| 旧后端不是纯文档遗留 | 平台根exports仍有coordinator/providers，旧experience仍有DesktopDocker调用。W1同时清理代码、exports、CLI、tarball和仅服务旧路径的测试/门禁，不能只删除一两个类 |
| 旧snapshot/restore仍在控制链 | runtime `cell_controller.go`、`snapshot_controller.go`、`restore.go`及CRD/RBAC仍关联。W1从活跃代码删除，历史留Git，不把未来备份当保留理由 |
| 只保留一份运行状态权威 | 平台意图/未知提交/删除屏障仍必要；CR及K8s资源决定运行事实。不是删掉平台全部SQLite |
| Pod不等于PVC，双卷要有理由 | 当前data/private两卷；目标分别承担数据保留和私有状态销毁。当前HOME仍在data，W3补真实工具路径验证，不声称凭据已全部分离 |
| 原卷身份与停止并发必须可验收 | W2记录PVC身份，缺失/替换失败，正常停止确认后才重启；不把RWO当单writer锁 |
| 代理可能有控制面开销 | 现有Connector每请求两轮验证约10次API读取；W3先测延迟/调用量再优化，不承诺未经测量的规模 |
| 热池、备份、自动idle各自扩大范围 | 不实现、不预留字段。显式停止/启动单独成W2；没有HTTP不等于后台无任务 |

## 未采纳或纠正

- Claude Code首轮以 `volumeClaimTemplates` 自动补建空卷为依据建议裸Pod；当前runtime实际是 `reconcileDataPVC/reconcilePrivatePVC` 显式创建，Pod按claimName引用。保留StatefulSet避免自建Pod替换机制。绑定卷丢失后的自动补建确实是W2必须收紧的行为，但不能用错误机制解释它。
- “平台只留principal→UID，把整个状态表删掉”忽略了提交结果未知和删除屏障。保留安全调用所需记录，禁止复制Pod运行状态。
- “零K8s读是内测硬门槛/100用户必出现p99问题”无测量依据；watch/cache本身有失效和身份风险。先测，再优化，不以旧endpoint缓存绕过发送前核验。
- “必须提供force路径，否则不可用”超出已确认健康节点故障模型；强删API对象不证明旧writer停止。失败应可诊断，管理员明确处置，不做产品自动强制恢复。
- 未来多Workspace默认名、未用字段和后端接口没有当前需求，拒绝预留。用户明确允许以后破坏性变化。
- OCI镜像构建/kind底座是开发发行工具，不能与用户Workspace后台进程混为一谈；停止Workspace不停止宿主测试集群。
- 长WebSocket不能无条件跨父认证失效续命；现有撤权语义继续保留。
- 两块PVC不是同Pod内部隔离、加密或秘密全量清除保证。数据与private保留策略不同才支持保留双卷；任意用户自行复制的token不受“只删private”全量清除承诺覆盖。

## 后续证据

新Kind与删旧入口见W1，显式启停/并发/卷身份见W2，真实工具授权、性能和新发行见W3。旧Cell回归通过不能替代它们。第二轮按修订稿复审，明确撤回了首轮关于kind、零查询硬门槛、删除平台屏障、自动force和认证长流的错误前提或过度要求。

## 第二轮采纳与边界

- 将Operator理由中的“现有异步启停”修正为已存在的创建/删除加下一步启停需求，避免把W2说成已经实现。
- 平台记录明确命名 `WorkspaceBinding`；稳定业务ID定位绑定，K8s `(namespace,name,UID)`是已分配实例身份。同一个领域工作区的授权与运行表示不是两个独立生命周期。
- 固定模板不可变意味着版本变化需新CR/新卷，明确禁止新UID自动认领旧卷；不新增迁移义务。
- 增加Stopped正面观测条件及证据不足的失败行为；generation/resourceVersion明确来自CR。W2必须实测这些观测可获得，不能只检查404。
- 明确删除ownership：新MVP data PVC固定保留、不级联；private与运行资源随明确删除清理，外部Secret不删除；区分PVC保留与PV reclaimPolicy。
- 新增卷身份校验的控制面读取纳入性能计数。

剩余的是实现与验证工作，不是已通过的验收：停止终态观测、并发启动屏障、DSH_HOME/HOME分离、真实OAuth回调/刷新和性能数据分别由W2/W3记录。没有为了审查通过新增强制恢复、缓存控制面、迁移、热池或备份承诺。
