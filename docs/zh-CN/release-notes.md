# 0.12.0-rc.1

[English](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/release-notes.md)

**2026-11-04 准备**，面向 npm `next` 和 GitHub 预发布。配套 runtime：**0.5.0-rc.2**；DSH：**0.2.1-rc.5**（`b830ec950faba0a46dda564be3e2d854afed94f1`）。已发布的平台 **0.11.0-rc.1**、runtime **0.5.0-rc.1**、DSH **0.2.1-rc.3** 仍是历史版本。

- Kubernetes 用户环境，每用户一个持久 PVC，使用 DSH 0.2.1-rc.5。
- DSH 0.2.1 原生持久化 authenticated browser 设置，runtime 不再 patch settings client。
- OIDC 成员管理、原生 HTTP/WebSocket 访问、显式启停与撤权。
- 支持 Linux/amd64、单节点、平台单副本、可信成员和全新安装，不提供原地升级。
- 不做兼容性承诺：部署时固定 platform、runtime、DSH 和制品身份。

使用从[安装](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/installation.md)开始。候选制品在发布时附上：[发行版本](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.12.0-rc.1)、[验证报告](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.12.0-rc.1/validation.md)。历史版本仍是 [0.11.0-rc.1](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.11.0-rc.1) 和[验证报告](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.11.0-rc.1/validation.md)。更早版本保留在 [Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases)。
