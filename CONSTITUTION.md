# DSH 平台与运行时项目宪法

2026-09-22 按用户最新 Kubernetes 单后端决定修订。适用 `dsh-multi-tenant` 与 `dsh-isolated-runtime` 的当前协同开发，不扩展到其他 DSH 项目。本文件是两仓库共享原则的维护源；仓库 AGENTS.md 负责技术执行差异，Issue 负责需求/验收，设计文档负责具体方案。

用户最新明确指令优先。原则可以随明确的产品决定调整；不把本文件变成新的审批流程。需求与验收主记录：[Issue #104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104)。

## 1. 核心验证优先

当前产品是快速试验的 MVP。优先走通：两个用户经 OIDC 登录、创建各自 Cell、使用原生 DSH、跨用户访问被拒绝。退出撤权、持久数据和失败行为随该链路验证。没有真实需求或当前验收依据的通用能力，不提前建设。

单集群、上层单副本、一套明确的参考配置足够。HA、多集群、自动扩缩容、灾备、无感执行恢复、完整安装发行产品不阻塞当前闭环。用现有工具和原生 Kubernetes 能力，不另建调度器、资源状态数据库或自动修复系统。

## 2. Kubernetes 单后端 + Agent Workspace

- multi-tenant 拥有 OIDC、稳定身份/成员映射、授权、平台及工作区访问会话、用户侧管理协议和访问准入。
- isolated-runtime 拥有 Agent Workspace 资源聚合、执行与存储生命周期、真实状态和受限应用通道；通过薄 CRD/Operator 使用原生 StatefulSet、PVC、Service 与策略。
- 原生 DSH 拥有 Web、对话 Session、工具、workspace 和应用协议；平台透明转发，不重写它们。

明确删除 Process/Docker 产品后端和多后端抽象，不再承诺“等第二个需求”或“类似 Kubernetes”的适配路线。保留清楚的内部模块接口以分工，不建设公共线协议、独立 runtime 服务、后端插件或历史 ABI。Pod 内子进程、OCI 镜像构建、kind 容器底座不属于被删除的产品后端。

每个租户内每用户当前最多一个 Agent Workspace，包含多个共享文件/凭据的 DSH 对话；工作区的稳定身份和存储不依赖某个 Pod 存活。平台只保留授权、分配与精确绑定，不复制 Kubernetes 运行状态。登出/撤权不隐式删除或停止环境。详细关系、命名替换和开发边界见 [Agent Workspace 契约](docs/design/agent-workspace.zh-CN.md)。该契约是下一版方向，当前源码仍有 Cell/旧后端，删除由 W1 验收。

显式正常停止/启动可作为有限的下一步功能；自动空闲判断、热池、备份/恢复不随抽象一并引入。没有真实需求与验收，不增加预留字段。允许破坏性演进不授权自动清空旧卷或旧集群。

## 2.1 一期隔离与协议收缩

一期以普通 Pod/容器作为执行边界，产品核心是 OIDC 后的独立 DSH 环境，不是通用 Sandbox 平台。不新增 Pod 内逐命令/工具的二级沙箱，不将 gVisor/Kata、可选 sandboxed 档位或跨后端安全矩阵作为门槛。应用 HTTP/WS、Session 和工具协议直接沿用 DSH；平台只做身份准入、环境归属与必要代理，运行时只做 Cell 和资源生命周期。

Pod 内允许完成用户态任务，但不授予宿主机权限或集群控制凭据。保留跨用户访问控制、独立存储、基本网络隔离和资源限制，不把“AI 遵循指令”当作访问控制，也不承诺容器绝不逃逸。受控成员 POC 不等于公开敌对租户的强隔离服务。优先消除人工校准、重复协议和部署步骤；不通过重写已验证主链路来追求代码数量减少。具体收缩设计见 [POC 边界与三轮计划](docs/design/poc-focus.zh-CN.md)。

## 3. 固定版本，允许破坏性变更

每次验证固定双仓库提交、DSH 基线和镜像身份。固定版本是可复现实验边界，不是长期版本冻结。对外发行必须锁定可公开拉取的 Cell/Operator 镜像 digest，并明确对应的 DSH 精确版本及源码提交；部署的平台镜像同样使用 digest。Alpha 成熟度由版本名明确表达；GitHub 使用普通 Release 并标记 Latest，不另设 Pre-release 分流。npm latest 是安装通道，不是运行时镜像漂移或版本范围兼容承诺。新迭代可以更换组合，但必须明确记录并验证，不能改写已发布制品身份。

当前接口、配置、状态格式和内部结构随时可以破坏性变更；**不承诺任何历史兼容、升级、数据迁移或无感恢复**。不为旧调用方增加兼容层、适配矩阵或弃用周期。新迭代可以要求新测试环境；版本不匹配明确失败。

变更说明必须说清破坏点、当前可用组合和重新验证方式，不能用“向后兼容”掩盖未验证行为。旧发行物与历史证据描述各自版本，不构成新代码的兼容义务；不篡改它们，也不将新设计冒充已发布能力。

## 4. Fast fail，错误可由人和 AI 解读

配置、身份、权限、模板或版本不符合前提时尽早拒绝。异步就绪只允许有界等待；暂时未就绪、已失败、执行结果未知必须区分。失败后保留必要诊断，让人或 AI 决定下一步，不自建无限重试或恢复编排。

错误至少表达：错误码、阶段、脱敏目标标识、已知状态、写入结果（未提交/已接受/未知）、重试建议、下一步检查与关联日志 ID。建议应指向可执行的只读检查或明确操作，不返回泛泛的“稍后重试”，不执行模型生成的修复命令。

超时/取消等待不等于操作未执行，更不等于资源已停止。结果未知先查原标识；不得自动换 key 创建另一份。认证失败拒绝访问，不能降级为匿名或较弱隔离。

## 5. 有限保证，不做无限系统

创建去重限于当前验证组合、同一分配及当前资源仍存在期间。已知实例必须按精确身份操作；删除、环境重建或版本切换后，旧调用/旧状态不属于可重放兼容范围。

不为无限期迟到请求建设永久 tombstone、通用退役状态机或操作日志引擎。调用方不得对已经绑定后又消失的实例自动重新 create，不得无限后台重试。并发删除与结果未知的创建应拒绝继续自动推进，返回可诊断错误。

无法确认旧 writer 停止就不宣称完成，不自动复用其数据。身份字段和节点心跳不能代替停止证明；节点分区/强制删除等超出已验证故障模型时交给管理员处理，不自建 fencing 控制面。

## 6. 快速迭代不牺牲基本边界

不串租户、不泄漏凭据、不误操作外来或新实例、不假报成功。版本不兼容可以失败；数据不能被静默删除。删除、重置或销毁凭据应说明确切目标、范围和授权，不以“允许破坏性变更”作为自动清空数据的理由。

持久数据保留不等于永久保留、备份或保证新版本可读取。管理员可显式清理任务拥有的数据；要核对实际资源并使清理可重试，不为此强制建设通用 purge/迁移 API。

## 7. 验证与交付

按当前验收和改动风险选择最短有效验证：文档检查不冒充运行验证，mock 不冒充原生浏览器验证，正常 Pod 重建不冒充灾难恢复。保留仍相关的隔离/ownership 测试，随明确的破坏性变更更新过时测试，不让历史兼容矩阵阻塞 MVP。

先得到一条真实链路的证据，再扩大能力。交付写明提交、实际检查、失败及未执行项。发布、部署、合并按用户已有授权处理；本宪法本身不授权对外发布或删除数据。

## English summary

Build the Kubernetes-only Agent Workspace MVP. Remove Process/Docker product backends and portability scaffolding; keep in-Pod subprocesses and OCI build tooling. The platform owns identity/admission and allocation bindings; a thin runtime Operator owns resource reconciliation; DSH owns application behavior. Explicit stop/start is bounded next work; automatic idle, pools and backups are separate deferred needs. The target rename and code removal require implementation evidence, not this document alone.

Validate exact source/image versions. Breaking API, configuration and state-format changes are allowed at any time: there is no historical compatibility, upgrade, migration or seamless recovery promise. Fail fast with structured, redacted diagnostics and bounded waits; unknown write results are not successful cancellation. Do not build permanent tombstones, an operation engine or an automatic repair system for unbounded replay guarantees. Preserve tenant/ownership boundaries and never silently erase data. Validate the current flow, not an unlimited historical matrix.
