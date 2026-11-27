# 0.12.0

[English](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/release-notes.md)

参考部署使用平台 **0.12.0**、`dsh-isolated-runtime` **0.5.0** 和 DSH **0.2.2-rc.5**。平台和 runtime 固定到同一个上游 DSH 提交。[DSH 源码](https://github.com/deepseek-ai/deepseek-harness/tree/9c2670d3bce5275e0d1610272958121af87787bb)

- 平台负责 OIDC、授权和环境绑定。平台启动时通过 `runtime.modulePath` 加载一个受信任的 runtime 适配器，集成方也可通过嵌入 API 提供适配器工厂。
- 环境契约 v2 使用适配器签发的精确实例和存储身份。绑定迁移保留所有者、分配键、原资源身份和待处理操作。
- Kubernetes 参考镜像单独安装固定版本的 Connector，并推荐使用 `dsh-isolated-runtime`。源码部署迁移配置时，把 runtime 专属设置放到 `runtime.options`，通过 `runtime.modulePath` 选择适配器。

参考验收范围为全新安装的 Linux/amd64 单节点 Kubernetes、单平台副本和测试用 OIDC 服务。测试报告记录冷启动登录、双用户访问和撤权、原生 HTTP 和 WebSocket、真实模型和授权 CLI、公网 MCP TLS 与 Bearer，以及启停和 Pod 重建后的同卷保留。原地升级、企业 SSO、高可用和生产容量超出本次验收范围。[外部 MCP OAuth 跟踪](https://github.com/GuoMonth/dsh-isolated-runtime/issues/127)[发布流程](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/releasing.md)

发布后用 `npm install --global dsh-multi-tenant@0.12.0` 安装精确版本，并使用对应 GitHub Release 中的镜像摘要。[安装指南](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/installation.md)
