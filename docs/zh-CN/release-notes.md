# 0.12.0-rc.2

修复平台传入绑定记录时的环境创建与只读分配恢复：控制元数据不再混入严格资源引用，owner 与资源 UID 校验继续生效。

SDK 依赖升级至 openid-client 6.9.0、ws 8.23.0、Zod 4.6.7，并更新 Connector 来源身份。配套 launcher 使用 Go 1.27.4，在公布进程结束前读完输出，并等待管理服务和代理清理完成。验证增加依赖安全扫描、原生 goroutine 泄漏检测和 goroutine 归属检查。

[English](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/release-notes.md)

**2026-11-17 准备**，面向 npm `next` 和 GitHub 预发布。配套 runtime：**0.5.0-rc.3**；DSH：**0.2.2-rc.3**（`38a6a5c965aa99ab525161efb7cc5cf1fe62fced`）。已发布的平台 **0.12.0-rc.1**、runtime **0.5.0-rc.2**、DSH **0.2.1-rc.5** 仍是历史版本。

- Kubernetes 用户环境，每用户一个持久 PVC，使用 DSH 0.2.2-rc.3。
- 官方 DSH web profile 负责 UI、认证浏览器设置、Session 存储和插件组合；不再使用 settings client 补丁或私有 Node loader 参数。
- OIDC 成员管理、原生 HTTP/WebSocket 访问、显式启停与撤权。
- 支持 Linux/amd64、单节点、平台单副本、可信成员和全新安装，不提供原地升级。
- 不做兼容性承诺：部署时固定 platform、runtime、DSH 和制品身份。

使用从[安装](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/installation.md)开始。候选制品在发布时附上：[发行版本](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.12.0-rc.2)、[验证报告](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.12.0-rc.2/validation.md)。历史版本仍是 [0.12.0-rc.1](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.12.0-rc.1) 和[验证报告](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.12.0-rc.1/validation.md)。更早版本保留在 [Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases)。
