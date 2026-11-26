# DSH 平台架构

[English](../en/architecture.md) · [文档目录](index.md)

## 组件

| 组件 | 负责 |
| --- | --- |
| dsh-multi-tenant | OIDC、成员、授权、持久环境绑定、访问会话、HTTP/WebSocket 准入、CLI 和安装 |
| [dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime) | 运行镜像、launcher、同进程 Connector、固定资源与生命周期 |
| Agent Sandbox core | 唯一的 Pod/Service 控制器 |
| DeepSeek Harness | 原生界面、对话、模型、工具和应用协议 |

平台授权后调用启动时选定的环境适配器。npm 包接受管理员提供的模块。推荐的 Kubernetes 参考镜像单独安装 [dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime) 的 Connector，由 Agent Sandbox 调谐 Pod 和 Service。

## 环境适配器契约

TypeScript API 导出 `AgentEnvironmentRuntime`、`EnvironmentAdapterFactory` 和 `ENVIRONMENT_CONTRACT_VERSION`。嵌入部署通过 `createPlatformApplication(config, secret, createRuntime)` 注入工厂。CLI 的 `runtime.modulePath` 指定一个受信任 ES 模块的绝对路径。模块导出 `contractVersion` 和 `createRuntime(options, { siteDomain })`，接收 `runtime.options`，以平台进程权限运行。见[直接启动](operations.md#成员与平台重启)。

第 2 版契约覆盖分配、查询、访问、启动、停止和删除。绑定保存精确的 owner、allocation key、`instanceId`、`storageId` 和可选的适配器 `locator`。修改前核对修订。写入结果未知时先查询原分配。确认原写入者停止且存储身份相同，才能启动。删除保留数据。撤权会关闭已建立的 HTTP 流和 WebSocket。

## 身份与存储

OIDC `(issuer, subject)` 映射为 `(tenantId, principalId)`。平台为每个 owner 保存一个绑定。适配器在访问或修改前核对精确资源。Kubernetes 参考适配器用 Sandbox 和 PVC UID 表示实例与存储，连接时核对当次 Pod 与端点。它可在 SQLite 事务中转换 v1 绑定，保留原资源和待确认操作。

Kubernetes 参考部署为每个 owner 使用一个 PVC 保存 workspace、HOME 和 DSH_HOME。平台状态、OIDC 密钥和基础设施凭据留在用户环境之外。见 [runtime 文档](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/README.zh-CN.md)。

## 来源与验证

- [DSH 版本](../../scripts/dsh-target.ts)：唯一的 DSH npm 版本和源码提交。
- Helm Chart [Chart.yaml](../../charts/dsh-platform/Chart.yaml)：`version` 是 Chart 修订号。`appVersion` 是该 DSH 针，不是平台 npm 版本。
- [Connector 来源](../../vendor/environment-connector.json)：源码提交和 tarball 完整性。
- [安装资产来源](../../charts/dsh-platform/files/sources.json)：控制器、runtime RBAC 和复制的 DSH 针。
- [发行验证](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.11.0-rc.1/validation.md)：实际镜像、双用户/模型/工具检查和限制。

共享边界见[产品原则](../../CONSTITUTION.zh-CN.md)。用户可见的数据与生命周期行为见[运维](operations.md)。
