# 产品原则

[English](CONSTITUTION.md)

适用于 dsh-multi-tenant 和 dsh-isolated-runtime。

- 为可信组织成员提供持久 AI 工作环境，使用原生 DSH。Kubernetes 是执行后端，上游 Agent Sandbox core 管理 Pod 和 Service。
- 平台负责身份、授权和环境绑定；runtime 负责精确资源身份与生命周期；DSH 负责对话、模型、工具和应用协议。
- 每个用户最多一个环境、一个数据 PVC。平台密钥和控制状态存放在用户环境之外。
- 访问和修改前核对 owner 与资源 UID。停止结果未知时不能启动第二个写入进程；卷缺失时不能用新空卷冒充恢复。
- 正常启停和 Pod 重建保留数据。登出、撤权和默认删除保留用户卷。备份、受支持升级、高可用和跨节点恢复单独建设。
- 发布和部署固定源码与制品身份。不承诺跨版本兼容，以实际部署组合的验收结果为准。

技术细节见[架构](docs/zh-CN/architecture.md)及其链接的 runtime 契约。
