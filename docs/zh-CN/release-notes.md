# 0.10.0-rc.1

[English](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/release-notes.md)

- Kubernetes 用户环境，每用户一个持久 PVC，使用 DSH 0.2.0-rc.2。
- OIDC 成员管理、原生 HTTP/WebSocket 访问、显式启停与撤权。
- 中英文指南重新整理，随包文档链接固定到源码提交。
- RC 使用 npm `next` 和 GitHub 预发布；支持 Linux/amd64、单节点/单副本、可信成员和全新安装。冻结公开接口、配置、CLI 和数据语义。

配套 runtime：0.4.0-rc.1。制品与实测范围见[发行及验证报告](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.10.0-rc.1)，使用从[安装](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/installation.md)开始。更早版本见 [GitHub Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases)。
