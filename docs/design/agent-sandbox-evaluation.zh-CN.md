# AgentEnvironment 复用 agent-sandbox 评估

2026-09-23。主线 [#104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104)，有限接入试验 [runtime #100](https://github.com/GuoMonth/dsh-isolated-runtime/issues/100)。下文保留本轮最初的源码评估依据；后续[真实本地接入](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/docs/evidence/agent-sandbox-local-2026-09-23.md)已通过，**现已选定上游 core 进入 W1，production 仍为 Cell**。

## 结论

**有限接入试验已通过，选择上游 core；W1 负责正式替换。** 上游与我们需要的持久用户环境高度相近：一个稳定 Kubernetes 对象，控制一个可替换 Pod，支持显式停止和重新启动。它不是 Pod 内逐命令的第二层沙箱；名字含 Sandbox 不意味着必须安装 gVisor/Kata。产品统一叫 `AgentEnvironment`，应用内部仍使用 DSH 原有 workspace/Session。

已验证的接入结构：

```text
平台：OIDC / EnvironmentBinding / 授权、未知结果和删除屏障
  → runtime：固定模板、外部 PVC/策略、精确身份核验与 DSH 通道
    → upstream Sandbox（唯一资源 CR，Running / Suspended）
      → 普通 Pod + headless Service（适配器显式设置 service=true）
      → Pod 挂载外部 data PVC + private PVC
```

不额外造同义 `AgentEnvironment` CRD，不 fork 上游，不同时运行自有和上游控制器管理同一组 Pod。产品 API 不直接暴露上游宽 PodSpec、拓扑 status 或 Kubernetes 写权限。StatefulSet 不是需求本身；若直接 Pod 能满足验收，就删除这层实现。

试验未引入新生命周期控制器、admission 系统或 fork；不扩出这些实现层。沉没成本不支持自研，上游名气也不证明适配已经成立。

## 固定证据

| 项目 | 本轮依据 |
| --- | --- |
| 上游 | [kubernetes-sigs/agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox)，Apache-2.0 |
| Release | [v1.0.3](https://github.com/kubernetes-sigs/agent-sandbox/releases/tag/v1.0.3)，GitHub 发布于 2026-09-17；不是文档示例中的旧版 |
| 源码 | `527d9346fe1d237dea5c003f3c720531c7bab1df`，以下源码链接固定此提交 |
| API | `agents.x-k8s.io/v1beta1` / `Sandbox`；release v1 不等于 API 或集成已稳定 |
| Core manifest | release `sandbox.yaml`，SHA256 `725fafdabe6aac202a89dc57f1cfe0e2e92f3164c8c2bd343fffca52f7039d96` |
| Controller image | 清单为 `registry.k8s.io/agent-sandbox/agent-sandbox-controller:v1.0.3`；初评仅有 tag；后续本地验证已固定公开 amd64 digest，见接入报告 |
| 构建依赖 | Go 1.26、toolchain 1.26.4，K8s Go 库 0.37.0；不等同于已验证的服务端兼容矩阵 |

Core 安装是一个 Sandbox CRD、一个 controller Deployment，以及 Namespace、ServiceAccount、ClusterRole/Binding 和 metrics Service。没有 core webhook、cert-manager 或快照组件依赖；extensions 默认不启用，不安装 SandboxClaim/Template/WarmPool。Controller 仍是可信的集群级基础设施，具备 Pod/PVC/Service/Sandbox 及事件、Lease 等权限，不能发给用户 Pod。依据：[core 安装](https://github.com/kubernetes-sigs/agent-sandbox/blob/527d9346fe1d237dea5c003f3c720531c7bab1df/k8s/controller.yaml)、[RBAC](https://github.com/kubernetes-sigs/agent-sandbox/blob/527d9346fe1d237dea5c003f3c720531c7bab1df/k8s/rbac.generated.yaml)、[可选扩展](https://github.com/kubernetes-sigs/agent-sandbox/blob/527d9346fe1d237dea5c003f3c720531c7bab1df/k8s/kustomization.yaml)。

## 已匹配与需补齐的边界

| 边界 | 上游实际行为 | 对我们意味着什么 |
| --- | --- | --- |
| 普通 Pod | 复制 PodTemplate 创建直接 Pod，不强制 RuntimeClass | 符合普通 Pod MVP；可删除自有 StatefulSet 控制路径 |
| 显式启停 | `operatingMode: Running / Suspended`；Suspended 删除 Pod、保留 Sandbox | 产品 Running/Stopped 可映射；不是保存内存或执行恢复 |
| 资源身份 | 核验 controller owner UID，拒绝多个 owned Pod | 有可复用基础，但不替代平台 owner 授权或发送前完整核验 |
| 持久卷 | `volumeClaimTemplates` 缺卷即创建，附加 Sandbox ownerRef；删 CR 会触发相应 GC | 不满足 data 保留/private 删除及绑定后缺卷失败；不使用此字段 |
| 过期策略 | `shutdownPolicy: Retain` 保留的是到期后的 Sandbox 对象 | 不是“删除环境后保留 PVC”的开关；不配置 shutdownTime |
| 停机观测 | 无 Pod 且无查询错误时 `Suspended=True` | 不证明节点分区/强删后的物理 writer 退出，也不满足我们单独的正常停止正面证据 |
| Pod 更新/认领 | 不更新已有 PodSpec；可能认领带 adoptable 或 namehash label 的无 owner Pod | 固定模板、新版本新环境；不使用旧 Pod 认领，连接前查实际 PodSpec，不能只看 CR/Ready |
| DSH 与授权 | 不理解 DSH、OIDC、用户绑定、凭据目录和网络准入 | launcher、Connector、平台认证、安全模板/策略仍归我们 |

源码依据：[OperatingMode 与过期策略](https://github.com/kubernetes-sigs/agent-sandbox/blob/527d9346fe1d237dea5c003f3c720531c7bab1df/api/v1beta1/sandbox_types.go#L271)、[停止状态](https://github.com/kubernetes-sigs/agent-sandbox/blob/527d9346fe1d237dea5c003f3c720531c7bab1df/controllers/sandbox_controller.go#L555)、[Pod 生命周期与认领](https://github.com/kubernetes-sigs/agent-sandbox/blob/527d9346fe1d237dea5c003f3c720531c7bab1df/controllers/sandbox_controller.go#L1188)、[PVC 调谐](https://github.com/kubernetes-sigs/agent-sandbox/blob/527d9346fe1d237dea5c003f3c720531c7bab1df/controllers/sandbox_controller.go#L1632)。

安全模板必须由 runtime 明确生成非 root、只读 rootfs、禁用 SA token 自动挂载、资源限制及网络策略。Core 接受普通 PodSpec 不等于自动施加这些产品限制；基础设施 API 宽并不要求产品 API 同样宽。上游 Pod 缓存只保留 `spec.nodeName`，不承担完整 live template 验证；Connector 必须读实际 Pod，不能复用裁剪后的缓存来证明模板一致。

## 最小适配与最硬的两个问题

上游 Service 是可选的，仅 `spec.service=true` 才创建；候选适配器显式开启，以验证现有服务目标核验链。

创建候选流程：先用原分配 key 创建 **Suspended** Sandbox，取得 UID；分配名称与该实例关联的显式 data/private PVC，确认 UID 并写入可信绑定；准备 SA/NetworkPolicy；最后使用 resourceVersion 条件更新为 Running。未知写入结果查原 key/实例，不换名重建。用户不获得 Kubernetes API 写权，label/annotation 只能作受信资源关联，不能自行构成用户授权。

PodTemplate 直接引用外部 PVC，完全省略 volumeClaimTemplates。data 不设随 Sandbox GC 的 ownerRef；private 的归属/清理必须在试验中验证正确顺序，保证停止保留两卷，显式删除保留 data 并清理已停止环境的 private/运行资源。保留 PVC 不等于备份或 PV reclaimPolicy。删除结果未知仍保留现有平台删除屏障；不新增通用 GC 服务。

**第一，PVC UID 与自动重建。** Kubernetes Pod 引用 PVC 名，不引用 PVC UID。入口校验可以拒绝错卷访问，但上游可能在平台离线时重建 Pod；仅在请求入口查 UID 不能证明重建时永不挂错卷。缺失外部 PVC 本身不会被 core 自动补建；同名替换、资源归属及平台离线的行为仍需实测。受信管理员带外替换 PVC/PV 内容不在本期自动安全保证内，不能为覆盖此情景引入完整 admission/fencing 系统，也不能隐藏普通故障路径的漏洞。**当前自有 Operator 同样会补建缺失 PVC，严格 UID pin 是待实现要求，并非自研已有优势。**

**第二，停止确认。** 先撤销访问，再请求 Suspended；试验验证能否有界观察本次 Pod UID 的 kubelet 终止状态、无可用 endpoint、原卷身份保持，以及控制器已观测当前 generation。仅看 Pod 404/上游 Suspended=True 不足；证据遗漏、API 失败或节点失联返回 StopUnverified，禁止自动启动第二 writer。不要求 HA/分区 fencing，不建设历史事件引擎；若正常停止也需要复杂常驻观测服务才能兑现，就判定接入不合算。现有自研路径也尚未验收该保证。

通过后可删除自有 Cell CRD/Go Operator、StatefulSet 调谐及仅服务它们的生成物/测试；保留 Go launcher、Node Connector 的 HTTP/WS/撤权/精确身份核验、固定安全模板、两卷分配/清理和平台 OIDC/EnvironmentBinding。收益是减少控制器维护，不是让我们的 runtime 包消失。Snapshot、Process/Docker 产品后端本就要删除，不能把那部分删除收益全部算作采用上游的收益。

## 本次验证及审查裁决

在固定提交的独立任务 worktree 使用本机 Go 1.26.8 执行：

```sh
GOTOOLCHAIN=local go test ./controllers \
  -run 'Test(ComputeConditions|CheckOwnership|ReconcilePVCs|MergeVolumeClaimVolumes|ReconcilePod|SandboxOwnedPodsRequiresOwnerUID|SuspendedConditionUnknownWhenPodLookupFails|ReconcileChildResourcesSuspendedForeignPod)' \
  -count=1 -json
```

**12 项顶层测试、含子测试共 82 项通过，0 失败。** 覆盖 ownership、Pod 恢复/冲突/停止、PVC 合并/认领、状态计算等现有测试。使用 fake client，未运行真实 API server、kubelet、CNI、CSI/GC、DSH 链路或 race 检测；不能据此声称 Kubernetes 兼容性、物理停止或性能已验证。

两位 Luna 独立做生命周期和接入依赖源码审查；Claude Code 通过禁用工具的只读摘要进行反方评估。**本机 Claude Code 实际调用 `deepseek-flash[1m]`，不是 Claude 模型**，其意见不能充当另一模型或独立源码验证证据。主线程裁决：

- 采纳“不套第二 CRD/控制器、先真实集群试验、外部卷与停止证据是关键”，拒绝仅凭 SIG 项目身份认定成熟度满足本产品。
- 纠正“Suspended=True 就是进程停止证明”；其源码分支证明的是 Kubernetes 可见对象状态。
- 不采纳“必须保留 StatefulSet，所以必须 fork/自研”；StatefulSet 是可替换的实现选择。
- 不采纳“上游 PodSpec/status 宽，必然破坏产品边界”；限制租户只走窄产品接口即可，但受信部署者权限和实际 Pod 验证必须明确。
- 不增加离线镜像仓库、强隔离内核、HA 或管理员带外操作防护作为当前选型门槛；公开镜像 digest 与可复现安装足够。

## 试验结果与下一步

[#100](https://github.com/GuoMonth/dsh-isolated-runtime/issues/100) 已完成普通 Pod、外部 PVC、原生 DSH HTTP/WS、启停、UID/缺卷/冲突及删除有限验证，证据与限制见[本地报告](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/docs/evidence/agent-sandbox-local-2026-09-23.md)。选型 GO 进入 W1，删除自有控制器路径；下面最初评估中的待验证项以本地报告的实际覆盖为准。

W2/W3 仍负责正式启停/证据缺失与相反意图并发、真实授权、两用户回归及联合发行。本次不把测试适配当生产实现，不为热池、自动 idle、备份或其他后端预留字段。
