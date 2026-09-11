# 兼容范围

0.7.0 以独立 Principal 原生 Host 替换共享进程插件。公开包提供可信平台 API 与单独的原生控制资产，不再有 DSH peer dependency 或 Cordis bundle 安装入口，不模拟旧逐 Agent API。

原生行为固定验证 DSH 0.1.5-rc.2，源码 `fb2c4b9e698e30edb738bca4cf0618587db7d203`；运行时位于各 Host 内。后续版本必须显式重定基线并运行原生回归，不承诺浮动版本兼容。平台支持 Node 22.19 和 Node 24+；内置进程/容器 provider 要求 Linux。Docker 是本地引擎、无网络参考实现，需要网络的部署提供经过审查的 provider。

使用新的平台目录。原生域实验沿用 domains_v1 格式，但不导入旧逐 Agent 租户数据库；旧数据独立留存。授权单位是 `(tenantId, principalId)`，没有域内独立根读取 grant。

安装、镜像/profile、认证与生命周期契约以 README 为准。历史版本说明只描述当时 API。
