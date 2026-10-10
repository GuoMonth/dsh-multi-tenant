# DSH 平台架构

[English](../en/architecture.md) · [文档目录](index.md)

## 组件

| 组件 | 负责 |
| --- | --- |
| dsh-multi-tenant | OIDC、成员、授权、持久环境绑定、访问会话、HTTP/WebSocket 准入、CLI 和安装 |
| [dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime) | 运行镜像、launcher、同进程 Connector、固定资源与生命周期 |
| Agent Sandbox core | 唯一的 Pod/Service 控制器 |
| DeepSeek Harness | 原生界面、对话、模型、工具和应用协议 |

平台完成授权后调用已打包的 Connector。runtime 核对精确资源并转发原生流量，DSH 在各用户 Pod 中运行。Kubernetes 调谐 Sandbox；runtime 通过同进程调用工作，不另外部署服务或后台控制器。

## 身份与存储

OIDC `(issuer, subject)` 映射为 `(tenantId, principalId)`。平台为每个用户保存一个环境绑定，记录 allocation key、Sandbox/PVC UID。namespace 名称和标签不能授予用户访问权。

每用户一个 PVC，保存 workspace、HOME 和 DSH_HOME。平台状态、OIDC 密钥和 Kubernetes 凭据留在平台 namespace。用户 ServiceAccount 不挂载集群 token。固定网络策略允许平台流量，公网出站排除集群、私网及 metadata 地址。

正常重建会更换 Pod UID，保留 Sandbox/PVC 身份。连接时 runtime 核对当次 Pod 和端点。授权撤销会取消已有 HTTP/WebSocket 连接。状态、修改和错误处理可从 [runtime 仓库](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/README.zh-CN.md)进入契约说明。

## 来源与验证

- [DSH 版本](../../scripts/dsh-target.mjs)：精确 npm 版本和源码提交。
- [Connector 来源](../../vendor/environment-connector.json)：源码提交和 tarball 完整性。
- [安装资产来源](../../charts/dsh-platform/files/sources.json)：控制器与 runtime RBAC 版本。
- [发行验证](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.10.0-alpha.1/validation.md)：实际镜像、双用户/模型/工具检查和限制。

共享边界见[产品原则](../../CONSTITUTION.zh-CN.md)。用户可见的数据与生命周期行为见[运维](operations.md)。
