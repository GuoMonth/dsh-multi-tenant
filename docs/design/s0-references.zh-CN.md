# S0 参考设计与取舍

研究日期：2026-09-19。只使用项目官方文档/源码，不将社区项目接口当成 DSH 已存在的标准。下面的“采用/不采用”是本项目的设计判断，尚未做第三方兼容实现。

## 1. OpenSandbox：协议与后端分离

固定来源：`opensandbox-group/OpenSandbox@ff4d1bc269cf6a9be03592649bed19633bf45222`。

- [README](https://github.com/opensandbox-group/OpenSandbox/blob/ff4d1bc269cf6a9be03592649bed19633bf45222/README.md)
- [Lifecycle API](https://github.com/opensandbox-group/OpenSandbox/blob/ff4d1bc269cf6a9be03592649bed19633bf45222/specs/sandbox-lifecycle.yml)

已核对：区分生命周期和执行 API，具有 Docker/Kubernetes 实现；生命周期规范包含创建、读取、暂停/恢复和 endpoint，部分能力存在后端支持差异。

采用：中立语义和后端映射分开；能力不能静默伪装一致。
不采用：照搬完整产品 API、任意 image/port/exec/filesystem。DSH 已提供应用层；我们的受控模板和独立环境归属更窄。也不将它的 endpoint API 自动当成可直接给浏览器的授权链接。

## 2. Kubernetes SIG Apps Agent Sandbox：有状态 singleton

固定来源：`kubernetes-sigs/agent-sandbox@4b3a922fc7de620b9f24679673928338b7a8d2bf`。

- [README](https://github.com/kubernetes-sigs/agent-sandbox/blob/4b3a922fc7de620b9f24679673928338b7a8d2bf/README.md)
- [官方文档](https://agent-sandbox.sigs.k8s.io/docs/)

已核对：Sandbox CRD 表达稳定身份的有状态 singleton，低层隔离交给 runtime；另有 Template/Claim/WarmPool 扩展。

采用：环境不等于一个进程；生命周期交给 Kubernetes 调谐。
不采用：首期引入 WarmPool/Claim 体系或替换已有 Cell Operator。现有 Cell 已承载 DSH 的访问、存储和基线约束，换底座会扩大验证范围。

## 3. containerd Sandbox API：稳定控制器接口

固定来源：`containerd/containerd@00a8ed44477ffe5a2c0a13f2f75a93afb3f8a17c`。

- [设计文档](https://github.com/containerd/containerd/blob/00a8ed44477ffe5a2c0a13f2f75a93afb3f8a17c/docs/sandbox-api.md)
- [Controller 接口](https://github.com/containerd/containerd/blob/00a8ed44477ffe5a2c0a13f2f75a93afb3f8a17c/core/sandbox/controller.go)

已核对：以 Controller 抽象具体 sandbox 实现，生命周期与承载细节分离。

采用：让提供方实现稳定语义，消费方不感知实现类型。
不采用：将 PID、shim、OCI/task 等底层结构放进平台协议，也不机械照搬其 Create/Start/Stop/Shutdown 方法表。我们管理的是长期应用环境。

## 4. E2B：pause 的含义不能含糊

来源：[Sandbox persistence 官方文档](https://docs.e2b.dev/sandbox/persistence)，2026-09-19 读取，网页不是固定发布版本。

已核对：文档区分包含内存的暂停和只保存文件系统的恢复方式。

采用：写清操作到底保留什么。
不采用：给 Cell 的缩容或 Process 的信号暂停冠以同样承诺。首版没有 pause API，避免把各自不同的恢复语义伪装成统一能力。

## 5. 标准与原生基础设施

- [OIDC Core §5.7](https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability)：稳定身份使用 issuer 与 subject 的组合；不是邮箱。此信息只在上层，runtime 不消费 OIDC claim。
- [Kubernetes API Concepts](https://kubernetes.io/docs/reference/using-api/api-concepts/)：复用对象版本、条件更新和读取/观察机制。resourceVersion 是适配器内的原生并发工具，不是公共全局 generation。

## 6. 本项目额外提出的语义

以下是基于本项目约束的设计，不宣称直接来自上述项目：

- 四操作 core：create/get/retire/resolveAccess。
- Environment 与 RuntimeInstance 的绑定、实例 key + incarnation 区分。
- 保留终态记录阻止退役后迟到 create 复活。
- 同进程 runtime-cell adapter + 非 bearer 的 AccessBinding/Connector。
- 单实例 OIDC 会话、host-only 环境 origin 和跨 origin 一次性 handoff。

采用成熟项目的边界思想，并不等于购买其全部功能面。S0 的符合性案例和 S1 实证用于验证这些本项目判断。
