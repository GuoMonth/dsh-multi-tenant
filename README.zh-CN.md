# dsh-multi-tenant

OIDC 多租户平台：登录、成员授权、环境会话及原生 DSH 协议入口；底层隔离由 [dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/README.zh-CN.md) 的 Kubernetes Cell 承接。

[English](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/README.md)

**当前为 Cell MVP alpha。** 核心双用户与真实模型回归已通过。版本 `0.9.0-alpha.1` 使用 npm `latest` 通道；latest 是安装通道，不代表稳定版。允许破坏性变更，不承诺历史兼容、升级或无感恢复。

## 固定发行边界

依赖的 DSH 明确为 **0.1.5-rc.2**，源码 **`fb2c4b9e698e30edb738bca4cf0618587db7d203`**。每次发行锁定可公开拉取的 Cell、Operator 镜像 `@sha256` digest，并在平台 `cell-release.json` / runtime `release.json` 中记录匹配的运行时源码与 DSH 身份；实际部署的平台镜像也固定 digest。npm `latest` 只用于安装时选择包，不让运行中的镜像标签或 DSH 版本范围漂移。

允许破坏性更新：新迭代明确新的固定组合，按需修改配置/状态要求并验证受影响链路，不要求兼容层、历史升级或迁移承诺。已发布制品身份不改写。已锁定公开运行时 [v0.3.0-alpha.1](https://github.com/GuoMonth/dsh-isolated-runtime/releases/tag/v0.3.0-alpha.1)，架构 Linux/amd64；精确 digest 见[发行清单](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/packages/multi-tenant/cell-release.json)。空 digest 仍会阻止发布。


## 启动

管理员先配置 K8s、平台模式 Cell Operator、OIDC、DNS/TLS、存储和权限。平台需要直接访问 Kubernetes API 与 Cell Pod IP，推荐在集群内运行；普通宿主机上的 npx 不会自动获得集群网络。

运行时准备：`npx dsh-isolated-runtime@0.3.0-alpha.1 manifests` 输出固定镜像的 Operator/CRD/RBAC 清单，由管理员审阅部署；`release` 输出固定 Cell 镜像及 DSH 版本。新版替代旧 standalone 启动器，不启动第二个用户服务。

```bash
# Node.js 24+
npx dsh-multi-tenant@latest start --config /private/config.json
```

`start` 前台运行；SIGINT/SIGTERM 只停止平台并保留 Cell/数据，SIGHUP 重读成员映射。正式部署记录解析出的精确 npm 版本及镜像 digest，不在每次重启时重新选择 latest。首版不自动创建 kind 集群。

现有集群部署、配置与管理员命令见[启动指南](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.zh-CN.md)。

## 尚未发布的 `cell-mvp-v1` 源码候选

本分支的平台包目标版本为 `dsh-multi-tenant@0.10.0-alpha.1`，尚未发布。已发布 `0.9.0-alpha.1` 与 npm `@latest` 仍使用人工校准 profile 配置，不接受候选格式。Connector 已绑定 runtime 源码 `ed914317e98a93752e8af4f7831c384fc1e92f13`；Cell/Operator 镜像 digest 仍为空，因为本地候选镜像不是公开发行物。见[候选配置指南](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/cell-mvp-v1-candidate.zh-CN.md)。DSH 仍固定为 `0.1.5-rc.2`。

## 两仓库分工

当前请求链路为 Envoy TLS/路由 → 平台 `openid-client` OIDC/准入 → Node Connector → Go launcher → DSH。Envoy 不负责平台登录或租户授权。

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| 本仓库 / `dsh-multi-tenant` | OIDC、可信成员映射、用户协议、父子会话、持久化分配意图、授权代理 | Pod/PVC 控制、运行时镜像构建 |
| `dsh-isolated-runtime` | Cell Operator、Cell 镜像、资源归属/生命周期、受限 Connector | 重复登录、用户成员权限、平台会话 |
| DSH | 原生 Web、应用会话、工具与模型调用 | 平台多租户授权 |

内部契约保持中立，正式跨后端兼容等第二个真实需求。首期一个集群、平台单副本、固定版本组合，不增加 HA 或恢复系统。

## 真实内测画面

以下来自 2026-09-20 的真实 OIDC → Cell → 原生 DSH 会话；使用 deepseek-flash 完成文件写入、读取和附件验证。画面不是平台重新实现的聊天 UI；模型凭据不随项目提供。

![Cell 内原生 DSH 的真实模型验证](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/images/cell-native.png?raw=true)

![展开的原生文件工具调用](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/images/cell-tools.png?raw=true)

[回归证据及未覆盖项](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/evidence/cell-regression-2026-09-20.md) 区分真实集群、本地 socket 与替身测试；[发行记录](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/releases/v0.9.0-alpha.1.md) 和[启动指南](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.zh-CN.md)说明已发布包及其边界。

- [项目宪法](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONSTITUTION.md) · [S0 契约](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/design/s0-runtime-architecture.zh-CN.md)
- [内测与发布流程](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/release.md) · [开发贡献](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONTRIBUTING.md)
- [文档索引](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/README.md) · [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82)

历史 Process/Docker SDK 和 workbench 资料不属于当前 Cell 安装链路，仅作为历史源码/证据保留。MIT；包内第三方实现许可证见 THIRD_PARTY_NOTICES。
