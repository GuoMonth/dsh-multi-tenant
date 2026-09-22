# Cell MVP v1 候选配置

这是尚未发布的 P2 源码候选。已发布平台 `0.9.0-alpha.1` 和 runtime `0.3.0-alpha.1` 仍要求人工校准 `allocation.profiles[]`；已发布说明见[启动指南](quickstart.zh-CN.md)。npm `@latest` 仍选择已发布包，不接受本候选配置格式。

候选只使用平台固定模板 `cell-mvp-v1`，每个 environment 必须使用同一模板。allocation 提供 runtime 镜像 digest、存储容量及可选 StorageClass/保留策略、CPU/内存 request 与 limit、tenant 到 namespace 映射、domain 和可选同 namespace credentials Secret。Kubernetes 资源由 runtime 校验并渲染。平台不接受 Pod 覆盖、`securityClass`、`profiles`、`expectedSpec` 或 `expectedPodSpec`。

从 [`config.candidate.example.json`](../../integration/distribution/config.candidate.example.json) 开始。其 `allocation.image: null` 是明确的未绑定标记，不是可用占位符：启动会拒绝它。只有匹配且经审查的 runtime 候选产出精确 digest 后才能替换。不可使用公开的 `0.3.0-alpha.1` 镜像。只有在 `cell-release.json` 绑定 Connector vendor 和 runtime 镜像身份、并随候选包提供后，才使用此候选。

准备已发布[启动指南](quickstart.zh-CN.md)列出的 Kubernetes API、platform 模式 Operator、Gateway/TLS、执行策略的 CNI、存储、namespace/RBAC 映射、DNS 和 OIDC 前置条件。DSH 仍精确固定为 `0.1.5-rc.2`；出站网络策略仍由管理员负责。此文档描述候选行为，不构成部署或验收记录。

[English](cell-mvp-v1-candidate.md)
