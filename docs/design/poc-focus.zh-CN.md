# POC 收缩：原生 DSH + 普通 Pod

> 2026-09-22：下一版方向由 [Agent Workspace 契约](agent-workspace.zh-CN.md) 与 [#104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104)取代。明确只做K8s，删除Process/Docker后端和多后端承诺；下文保留现有Cell实现依据，不能将旧范围/未验收措辞作为新待办。新Kind/启停尚待W1/W2实现。

2026-09-21。根据用户要求重新收缩范围；本文件区分当前事实与下一步设计，不宣称待实现简化已经发布。职责原则仍以 [宪法](../../CONSTITUTION.md) 为准，验收状态以 [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82) 为准。

## 结论

首期产品是“通过 OIDC 进入属于自己的 DSH 工作环境”，不是通用 Sandbox 平台。以一个 Cell 对应一个普通 Pod 的执行边界承接完整 DSH。Pod 内不再新增每条命令、工具或子代理的第二套 sandbox、审批协议或文件权限模型。gVisor/Kata/额外 RuntimeClass 安全档位移出一期。DSH 自身工具语义保持原生，不因本设计批量关闭其已有保护。

设计目标是允许用户在自己的可写目录执行代码、启动子进程、安装用户态依赖并修改文件；当前回归只证明模型文件/附件任务，命令、子进程和用户态安装作为新增 P3 小型任务验证，不能先宣称通过。任务可能破坏自己的工作环境，这不是平台替用户恢复的责任。并不因此开放 privileged、宿主机挂载、Docker socket、hostNetwork 或集群凭据。默认非 root 与 RuntimeDefault seccomp 成本很低，保留；系统级软件放进固定镜像。若真实 POC 任务需要更宽的容器文件写入范围，再单独调整挂载或镜像，不能把“移除额外 sandbox”等同于关闭所有容器限制。

## 当前证据：问题主要在部署与配置

- Runtime `cbc8be42` 的 `api/v1alpha1/types.go` 定义 standard/sandboxed；`internal/controller/resources.go` 只有 sandboxed 才设置 RuntimeClass。标准路径已经是普通容器，不存在必须启用 gVisor 的门槛。
- `internal/controller/resources.go` 已设置不挂载 ServiceAccount token、非 root、drop capabilities 和默认 seccomp。这些是 Pod 基础约束，不是自研二级 sandbox。
- `packages/cell-connector/src/cell.ts` 对 Cell spec 和整个 Pod spec 做深比较；`allocation.ts` 从管理员提供的 expectedSpec/expectedPodSpec 建立 profile。平台 `integration/distribution/config.example.json` 仍要求填写 API 默认化后的这两份对象，quickstart 要求先建校准 Cell。这是当前主要的部署复杂度。
- 当前 runtime 为 Cell 自动生成的是 ingress NetworkPolicy（`resources.go`）；egress 到集群控制面、私有网络的限制依赖管理员配置，不能宣称一个 Pod 已自动阻断全部外部影响。P2 的参考部署必须明确并验证这部分。
- 2026-09-20 的两身份、真实模型和文件操作已经在固定组合完成；不是“POC 代码还未跑通”。公开 npm 安装也已验证。但另一位管理员不依赖维护者的实验台即可配置并跑通，尚不能由这些结果推出。
- npm runtime 目前只打印 manifest/YAML，不是集群安装器；npm 平台启动仍需私有配置和集群网络。发布两个包不代表已完成简单安装体验。

## 最小架构和协议

```text
浏览器 → 平台（OIDC + 成员准入 + 环境绑定）
          ├─ 原生 HTTP / WS 代理 → 自己的 Pod → DSH 原生 Web / Session / Tools
          └─ 内部 RuntimePort → Cell Operator → Pod / PVC / 网络策略
```

应用协议直接对齐固定版本的 DSH，不再定义平行的 Chat、Session、工具、文件或流式事件协议。透明转发仍须做请求身份准入、受控目标绑定与必要认证适配，不能裸露 launcher 管理端口或把平台凭据转入 Cell。

管理协议只维持内部 create / inspect / connect / requestDelete 的既有职责；不建设公开 Sandbox SDK、独立 Runtime HTTP 服务、插件系统或跨后端兼容框架。应用 Session 属于 DSH，平台登录会话属于 OIDC，两者不能因为“统一协议”而合并。

保留现有 Operator，暂不为减少一个组件把 Pod/PVC 控制逻辑重新搬回平台。这种改写会重做已经通过的创建、归属和删除，不利于首版。只有在削减旧分支后仍有证据表明它阻碍部署，才比较更小的直接 K8s adapter。

## 普通 Pod 足够的前提

POC 是受控成员、受控集群的试验，不定位为托管任意敌对租户的强隔离云沙箱。共享内核的容器不是虚拟机边界，不能承诺“出错绝不影响别人”，也不能估计逃逸极罕见来替代配置隔离。

必须保留：OIDC 与跨 owner 校验、平台凭据不进用户 Pod、独立用户卷、无宿主权限、CPU/内存与临时空间限制。跨租户 ingress 使用已有策略；控制面/私有地址的非必要 egress 阻断是管理员部署前提和待验收项，并非当前 runtime 自动提供。模型 API 等必要外网访问按参考环境配置。网络策略要求 CNI 实际执行；Pod 默认存在不意味着网络已经隔离。相信 AI 的指令遵循是使用预期，不是访问控制措施。

Kubernetes 官方依据：[多租户](https://kubernetes.io/docs/concepts/security/multi-tenancy/)、[NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/)。这里只保留实现当前承诺的低成本基础约束，不扩展安全认证或全攻击矩阵。

## 执行路线

后续顺序和仓库分工只维护于 [roadmap](../roadmap.md)，任务验收在 [P2 #99](https://github.com/GuoMonth/dsh-multi-tenant/issues/99) / [P3 #100](https://github.com/GuoMonth/dsh-multi-tenant/issues/100)。本设计维护为何收缩、哪些边界不能被简化掉，不重复维护另一套执行清单。

P2的模板必须明确谁生成Pod、允许哪些API默认化，以及Cell→工作负载→Pod UID/owner链。不能通过删除全部检查或只信任用户可写label来替代人工校准。

## 验收终点

另一位开发者在已经提供 K8s、OIDC、DNS/TLS 的约定环境里，不借助维护者私有 lab 数据，按文档完成上述闭环，即达到首版 POC 交付目标。记录实际步骤、失败点与用时，不承诺尚未测量的“一分钟启动”。未达到这个终点前，不因增加可选后端、抽象或发行通道扩展路线图。

## 取舍依据

保留已验证Operator和最小分配状态机，避免退回预建Cell重新实现已完成能力；快照/恢复与standalone第二认证链不列为POC必需。源码、已发布制品和独立部署验收分开记录。历史审查过程见 [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82)，不作为额外规范或执行门禁。
