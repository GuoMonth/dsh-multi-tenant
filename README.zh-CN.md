# dsh-multi-tenant

OIDC 多租户平台：登录、成员授权、环境会话及原生 DSH 协议入口；底层隔离由 [dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/README.zh-CN.md) 的 Kubernetes Cell 承接。

[English](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/README.md)

**当前为 Cell MVP alpha 候选，尚未发布本次制品。** 核心双用户与真实模型回归已通过。版本 `0.9.0-alpha.1` 计划发布到 npm `latest`；latest 是安装通道，不代表稳定版。允许破坏性变更，不承诺历史兼容、升级或无感恢复。

## 启动

管理员先配置 K8s、平台模式 Cell Operator、OIDC、DNS/TLS、存储和权限。平台需要直接访问 Kubernetes API 与 Cell Pod IP，推荐在集群内运行；普通宿主机上的 npx 不会自动获得集群网络。

```bash
# 本次版本发布后；Node.js 24+
npx dsh-multi-tenant@latest start --config /private/config.json
```

`start` 前台运行；SIGINT/SIGTERM 只停止平台并保留 Cell/数据，SIGHUP 重读成员映射。正式部署记录解析出的精确 npm 版本及镜像 digest，不在每次重启时重新选择 latest。首版不自动创建 kind 集群。

当前已发布的旧 `0.8.0` CLI 是本地 Docker 演示，不能用于这条 Cell 链路。源码候选的打包、现有集群部署、配置与管理员命令见 [内测启动指南](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.md)。

## 两仓库分工

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

[回归证据及未覆盖项](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/evidence/cell-regression-2026-09-20.md) 区分真实集群、本地 socket 与替身测试；[发行说明](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/releases/v0.9.0-alpha.1.md) 区分已验证源码与待绑定的公开制品。

- [项目宪法](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONSTITUTION.md) · [S0 契约](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/design/s0-runtime-architecture.zh-CN.md)
- [内测与发布流程](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/release.md) · [开发贡献](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONTRIBUTING.md)
- [文档索引](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/README.md) · [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82)

旧 SDK 的 Process/Docker 导出暂留作历史开发入口，既不承诺后端兼容，也不参与当前 CLI 启动链路。MIT；包内第三方实现许可证见 THIRD_PARTY_NOTICES。
