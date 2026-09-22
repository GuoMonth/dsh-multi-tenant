# Agent Workspace：Kubernetes 单后端架构裁决

2026-09-22。主线 [#104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104)。本文是下一版破坏性调整的契约；不是新能力已实现或已发行的声明。现有 `Cell` 候选和 [9 月 22 日回归](../evidence/cell-mvp-2026-09-22.md)保持其原有范围。

## 1. 决策与反方

只做 Kubernetes。删除 Process/Docker 产品后端、后端工厂和为潜在替代平台预留的接口；不把“类似 K8s”写进范围。保留同进程 runtime 客户端和平台模块边界，它们用于分工，不用于可插拔后端。Pod 内 Bash/子进程、OCI 镜像构建和 kind 所用容器底座不在删除范围。

保留薄 CRD + Operator，并把产品及下一版 Kind 统一为 **AgentWorkspace**。不再同时发展 Environment、Cell、Seal 三个独立产品对象。`Workspace` 是行文简称；DSH 内的 workspace 指应用目录，不能与资源对象混淆。W1 直接改 Kind/类型/配置/生成物，不维护双 Kind、转换 webhook 或旧 API shim；仓库和 npm 包名不因本次概念整理改名。

理由是当前已有的资源归属、异步创建/删除和存储保留，以及下一步明确启停需求，需要同一个稳定身份与唯一调谐者，而不是“未来可能要热池/备份”。直接 StatefulSet + PVC 也可由 runtime 客户端管理，并不必然把 K8s 逻辑推给平台；那会少一个 CRD/控制器，却需要在调用方处理平台退出后的异步生命周期、跨资源观测和错误归属。本次选择把这些工作留给一个薄 Operator，接受 CRD/RBAC/镜像发布和排障成本。

保留单副本 StatefulSet 与**显式创建的 PVC**。裸 Pod 方案会把 Pod 替换/重建责任移入自有控制器；当前没有证据表明这能减少总复杂度。不得把“只保留一副本”误写为“任何故障下物理上绝无第二进程”。不开放任意 PodSpec/YAML 上传、插件系统、模板 CRD 或第二调度器。

## 2. 对象关系

| 对象 | 关系与含义 | 权威 |
| --- | --- | --- |
| Principal | OIDC `(issuer, subject)` 经平台映射后的成员身份；不是邮箱或浏览器 | 平台 |
| Agent Workspace | 每 `(tenantId, principalId)` 当前最多一个；未创建时可只有分配记录 | 平台负责授权/绑定，K8s CR负责资源期望/事实 |
| AgentWorkspace CR | 已分配工作区的运行资源；UID稳定，同名新UID是另一个实例 | runtime Operator |
| Pod | Running期望一副本，Stopped期望零；可以重建换UID | StatefulSet/Kubernetes |
| PVC | 当前两块：data与private；一个Pod可以挂多个PVC | Kubernetes存储与runtime归属管理 |
| DshSession | 同一Workspace中多个原生对话，共享文件、工具、HOME和用户凭据 | DSH |
| PlatformAuthSession / WorkspaceAccessSession | 平台登录及派生工作区访问授权，与对话独立 | 平台 |

登出/成员撤权关闭访问，不自动停机或删数据。删除对话不删除Workspace。对话ID只能在已授权Workspace内解释，不是全局授权凭证。同用户对话之间没有沙箱或凭据隔离承诺。

Namespace是管理员分配的基础设施范围，不等同OIDC tenantId，也不能单凭namespace或可伪造label认定用户权限。参考部署继续使用管理员预配置的用户namespace；本次不增加namespace/租户自动供应系统。

## 3. 唯一权威与最小契约

平台保留一个 `WorkspaceBinding` 记录，表示同一工作区的授权/调用绑定而非第二个运行实例：owner、稳定业务ID、分配key、精确runtime引用、提交结果未知及删除屏障。它们保证授权、去重和安全调用，**不是Pod运行状态数据库**，不能因去掉多后端而删除。现有 `AllocationStore` 的 `reserved/submitted/bound/delete-requested` 不能被误读为第二份Running/Stopped状态机。不新增Workspace表再保留另一份Environment实体。

Kubernetes CR保存资源期望；Operator写观测状态。平台不持久镜像一份replicas/PodIP/PVC生命周期、不直接patch底层StatefulSet；读取状态和实际请求准入使用runtime客户端。DSH保留原生应用协议，平台/runtime均不做对话、工具、OAuth刷新代理。

最小目标字段（实现时使用该版本唯一类型定义，不另造JSON协议）：

- 创建时不可变：分配/归属关联、当次固定模板修订与精确镜像/DSH组合、管理员批准的资源/存储配置。owner关联用于资源一致性，不能替代平台鉴权。UID由K8s颁发。平台业务ID只用于找到绑定；一旦分配，资源操作的实例身份是绑定中的 `(namespace, name, UID)`，不能凭业务ID认领同名新实例。
- 可改期望：`desiredState: Running | Stopped`。不加副本数、BackendKind、warmPool、snapshot、restore、idleTTL、迁移策略或未使用扩展字段。
- 观测：`observedGeneration`、少量conditions/reason、首次绑定的data/private PVC `(name, UID)`，以及本次停止需要的最小退出观测。绑定是防止误用数据的实际必要事实，不扩成卷注册中心；不含token、对话内容、节点目录或长期复制的Pod拓扑。
- `Running`是期望，不是就绪承诺；`Stopped`只能在本次generation的正常停止已确认后报告。未知/失败提供阶段、目标、写入结果、检查建议与关联ID，不强行捏造终态。

## 4. 启停与卷身份

W2增加**显式停止/启动**，不是自动空闲回收。停止入口说明会中断整个Workspace的模型调用、工具和后台程序；关闭页面、无新对话、空闲WebSocket均不能证明无人执行。没有可靠DSH活动信号之前，不加自动idle计时器。

正常流程：拒绝新的应用准入并撤销已有连接 → Operator正常缩到零并观测停止 → 保留CR及两块PVC → 明确启动/进入操作请求Running → 校验原卷身份和固定模板 → Pod就绪后放行。普通查询状态不唤醒；不自动重放之前可能已执行的HTTP写请求。恢复持久文件/对话，不恢复进程内存或被中断任务。

固定模板/镜像改变属于新版本新环境：创建新CR/新UID和新卷，旧卷不能自动认领或克隆。当前不支持原地升级或新CR复用旧卷，不能把“不兼容”解释为自动删除旧数据。

首次创建允许分配两个卷，记录绑定后再放行工作负载；首次写入结果未知按原key/owner查询。绑定完成后，缺卷、同名不同UID或归属冲突必须失败，不能自动造空卷冒充恢复。准入也核验存储绑定。保留显式PVC，禁止使用会自动补建存储的路径绕过此规则。

重复同意图请求幂等，相反并发意图使用AgentWorkspace CR的 `metadata.generation/resourceVersion` 约束并明确冲突（不是平台分配序号）；停止尚未证实时不得提前启动另一writer。健康节点上的正常停止是本期故障模型；节点失联、强制删除、管理员绕过控制器或替换PV内容不在自动恢复保证内。不能只凭Pod对象404、节点心跳或RWO名称宣称物理writer已停；失败交管理员，产品不提供假安全force-resume或自建fencing。

Stopped正面验收：针对本次已知Pod UID，观测到kubelet上报的容器终止/Pod终态；对应StatefulSet已观测缩容generation且副本为零；该Workspace不再有Pod或可用应用endpoint；两卷绑定仍一致。若原本从未启动过，需确证首次分配没有创建过工作负载。正常终止事件遗漏或controller重启后证据不足，返回停止未证实，不能把一次404当成功；只保存本次必要退出观测，不建设历史日志引擎。此判据依赖健康节点与受信K8s的正常终止路径，不能覆盖强删/分区下的物理进程保证。实现和实际可观测性在W2验证，文档不冒充已跑通。

显式删除与休眠不同：下一版MVP data PVC固定Retain，不以Workspace ownerReference级联删除，保留不可变归属标记；private PVC、StatefulSet和Service随Workspace删除清理，入口先明确私有状态/凭据销毁范围。外部Secret不由Workspace持有，不自动删除。管理员另行授权清理保留的data PVC；PVC真正被删除后，底层PV按StorageClass/PV的reclaimPolicy处置，因此应用的“Retain PVC”不等于PV的“Retain回收策略”。旧环境保留，不自动改旧ownerReference或执行卸载。

PVC UID绑定能发现资源替换，不能证明底层磁盘内容没被集群/存储管理员修改，也不能原子封锁管理员在核验后替换资源。K8s没有提供按PVC UID挂载的Pod字段；这些特权带外竞态不属于当前租户威胁模型。PVC保留不是备份，删除/丢失卷可能导致永久丢失。

## 5. 文件、工具与授权状态

下一版固定并验证目录职责：

| 位置 | 目标内容 | 停止/重建 | 显式删除 |
| --- | --- | --- | --- |
| data PVC | DSH对话/应用持久状态、工作文件 | 保留 | 按明确data保留策略处理 |
| private PVC | 用户HOME、XDG配置/CLI授权、用户态工具、DSH指定凭据 | 保留 | 明确说明删除私有状态/凭据；不把它并入data备份承诺 |
| 镜像 | 固定DSH、基础工具及系统依赖 | 使用相同digest | 不包含用户秘密 |
| 临时卷 | `/tmp`、可重建缓存 | 可丢失 | 不保留 |

两块PVC的理由是**删除/保留策略不同**，不是同Pod内的安全隔离或加密。当前HOME仍在data卷、只有DSH指定credential在private；W3需实际调整HOME与DSH_HOME/XDG路径并验证DSH和所选工具，不能宣称已经统一。用户手工将token复制到data时，删除private不能保证清除所有副本。

token更新由原MCP客户端/CLI完成并写回可写持久目录；不做通用OAuth代理、凭据数据库或刷新守护进程。只验收选定的真实工具及其无桌面登录/回调/存储方式；系统钥匙串/本机浏览器依赖不因挂PVC自动解决。refresh失败可能需要重新授权。平台OIDC secret与集群权限永远不进入用户环境；CR/status/日志/镜像不保存用户token。

Pod非root、系统目录只读继续保留。系统依赖预装镜像，用户态安装使用持久目录与明确PATH。同用户所有对话可使用该用户工具授权，跨用户独立卷；不承诺任意工具安装兼容。

## 6. 限额与性能

当前每用户一个Workspace，使用批准的CPU/memory requests/limits和PVC容量；管理员按namespace配置ResourceQuota/LimitRange。不加计费、全局容量分配或自有调度器。PVC申请容量不等于所有存储后端都实现目录硬配额，特别不能用本机local-path的容量字段冒充硬限制。

测量冷/热镜像的创建与唤醒时间、内存占用、请求延迟与K8s API读次数，记录样本量、硬件、存储和并发。当前约10次K8s读取/请求来自两轮Connector核验，不是每个流消息都重复。W2新增卷绑定核验也计入调用预算。先建立基线，再消除重复工作；发送前身份校验、当前Pod归属与撤权语义不能为了“零API读取”而丢掉。不把未实测的100用户/秒级唤醒作为承诺。

备份/恢复、热池和自动空闲是各自独立需求，**本轮不实现、不预留字段**。备份需要恢复目标与凭据策略，热池需要可量化启动瓶颈和新租户认领/清理边界；未来到需要时允许直接改契约。预拉镜像也先由测量证明收益。

## 7. 有限开发顺序

1. **W1收缩与统一**：runtime [#97](https://github.com/GuoMonth/dsh-isolated-runtime/issues/97) + 平台 [#105](https://github.com/GuoMonth/dsh-multi-tenant/issues/105)。同步AgentWorkspace类型/CRD/模板/消费契约，删除Process/Docker、standalone第二认证链、snapshot/restore活跃代码与仅服务它们的测试/发布门禁。原生资源仍由K8s负责。两侧可并行，runtime契约先固定，平台随后绑定。
2. **W2显式停止/启动**：runtime [#98](https://github.com/GuoMonth/dsh-isolated-runtime/issues/98)，包含平台消费端。验证原Workspace/两PVC身份、并发、异常诊断、后台任务终止和连接撤销。不依赖自动idle。
3. **W3真实授权、性能、发行**：平台 [#106](https://github.com/GuoMonth/dsh-multi-tenant/issues/106)。真实MCP/CLI授权、持久HOME、两用户回归、冷启动/API调用测量，公开镜像+配套npm+固定DSH并由另一操作者安装。工具与授权供应方未确定时先记录缺口，不拿mock冒充真实验证。

W1本身不扩大功能；W2/W3验收前#104不关闭。旧发行不追补兼容，不自动卸载旧CRD、删除旧Workspace/PVC或迁移已有数据。所有破坏点在新发行说明明确；本轮文档PR不修改运行环境，也不证明W1已经实现。

## 8. 参考与审查

- [Kubernetes Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)：自定义资源适合声明式资源管理；不把会话/应用数据塞入Kubernetes API。
- [StatefulSet](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/) / [PV访问模式](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes)：使用原生工作负载和存储；RWO是单节点语义，不能充当单writer证明。
- [Pod终止语义](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)：正常删除与强制删除不是同一停止证据。
- [DevWorkspace Operator](https://github.com/devfile/devworkspace-operator)：说明工作区聚合有社区先例；不引入其Devfile、组件编排或安装复杂度。它不是本项目必须采用CRD的证明。
- 本次 [对抗审查与裁决](../evidence/agent-workspace-review-2026-09-22.md)：两位Luna源码审查，Claude Code独立评估，主线程按事实裁决。
