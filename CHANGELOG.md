# Changelog / 更新记录

Published artifacts and tags are listed in [GitHub Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases). Source milestones do not necessarily have an npm release.

## Unreleased

- Docker now defaults to bridge networking for outbound model API and remote MCP access; set `network: 'none'` for offline operation. Bridge is not a network tenant boundary.
- Ship a runtime Dockerfile and npm dependency lock with common shell, search, Git, HTTP, Python and build tools; keep test fixtures out of the user image.
- Docker 默认 bridge 出站，可显式配置 `network: 'none'`；bridge 不承诺网络级租户隔离。
- 随包提供运行时 Dockerfile、依赖锁和常用 AI Bash 工具，不包含测试模型或测试 MCP。

## 0.7.0 — 2026-09-11

**Developer integration release; breaking change from 0.5.x.** Give each user within a tenant an independent native DSH Host while reusing the official Web and preset/subagent behavior.

- Added a durable domain directory, deduplicated runtime lifecycle, suspension/revocation and verified container recovery.
- Added authenticated native HTTP/WebSocket ingress, private native cookies, inode-pinned Unix transport and cross-origin frame protection.
- Added the constrained offline Linux Docker reference, trusted-development process provider, public runtime/authentication interfaces and installed-consumer examples.
- Adopted `(tenantId, principalId)` as the authorization boundary. Native intra-domain permissions remain; independent project/session read ACLs are not provided.
- Removed the shared-process Cordis bundle, per-Agent facade, old exports, custom panel and legacy root ownership schema implementation. No automatic legacy-data migration.
- Pinned native DSH to `0.1.5-rc.2`; covered Node 22.19/24, 32 platform tests, 2 release-gate tests and 16 installed native acceptance groups.

**Important boundary:** the Docker reference has no outbound network. External model APIs/remote MCP require a reviewed runtime provider. Login/SSO, TLS, domain provisioning and operations are supplied by the embedding platform.

**中文：** 本版本面向搭建多用户 DSH 服务的开发者。用户获得独立的原生工作环境；平台负责域归属、入口认证、暂停/撤销和崩溃恢复。删除旧逐 Agent 接口和自定义面板，沿用原生 Web、preset、MCP 和子代理。域内不提供项目/会话级独立读取授权。升级须新建数据目录并替换接入代码；内置 Docker 无出站网络，外部模型/MCP 需要相应 provider。

[Full release notes / 完整说明](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/releases/v0.7.0.md)

## 0.6.0 — source milestone, not published to npm / 源码里程碑，未发布 npm

Introduced the rc.2 Agent-resource integration and scoped Web experiment. Its architecture was replaced before publication by 0.7.0. Historical details: [source notes](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/releases/v0.6.0.md).

## 0.5.0 — 2026-09-09

Previous published release. See the authoritative [v0.5.0 release notes](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.5.0). Users upgrading to 0.7.0 must adopt the new Host-based integration.

## Earlier releases / 更早版本

See [release history](https://github.com/GuoMonth/dsh-multi-tenant/releases).
