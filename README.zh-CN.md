# DSH multi-tenant

[English](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/README.md)

在 Kubernetes 上自托管的多用户 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。成员通过 OpenID Connect（OIDC）登录，在各自的持久 AI 工作环境中使用 DSH 原生界面。

**Alpha：** Linux/amd64、单集群、平台单副本，面向可信组织成员。已发布组合为平台 **0.10.0-alpha.1**、runtime **0.4.0-alpha.1**、DSH **0.2.0-rc.2**。

## 安装

准备已有 Kubernetes 集群、支持网络策略的 CNI、动态存储、HTTPS 入口和 OIDC 身份提供方。安装机需要 Node 24+、Helm 3 和 kubectl。

```sh
npm install --global dsh-multi-tenant@0.10.0-alpha.1
```

按[安装指南](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/installation.md)准备配置，运行预检和安装。镜像使用[同版本发布清单](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.10.0-alpha.1)中的版本。让 AI 助手操作时，可提供 [AI.md（英文）](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/AI.md)。

## 使用

打开平台地址并登录，选择 **Enter / create**，再选择 **Inspect / resolve status**。状态为 Ready 后，点击 **Open environment**，在 DSH 内配置模型和工具。

每用户一个持久卷，保存文件、对话、配置及工具凭据。正常启停和 Pod 重建会保留原卷。**Stop** 中断整个环境；登出或移除成员会撤销访问并保留数据。重启、删除和排障见[运维指南](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/operations.md)。

## 文档

- [中文指南](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/index.md) · [English guides](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/index.md)
- [架构](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/architecture.md) · [参与开发](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONTRIBUTING.zh-CN.md)
- [runtime 仓库](https://github.com/GuoMonth/dsh-isolated-runtime)：维护运行镜像、资源身份与生命周期。平台已打包其 Connector，部署从本仓库开始。
- [发行版本与验证报告](https://github.com/GuoMonth/dsh-multi-tenant/releases)

MIT 许可证。
