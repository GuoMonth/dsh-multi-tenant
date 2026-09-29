# DSH 多租户平台

Alpha OIDC 平台，每个授权用户一个持久 DSH 环境，仅支持 Kubernetes。DSH 提供原生 Web、对话、工具和应用协议；平台负责登录、成员授权、环境绑定和访问撤销。进程内环境 Connector 按固定模板供应上游 agent-sandbox。

本候选固定 **DSH 0.2.0-rc.2**，commit `639ed015397290b3745d163aafe02ffee4aa3f84`，仍在联合验证中，不代表已发布或生产可用。不提供旧 Alpha 状态、Cell、Process、Docker 后端兼容或迁移。新格式使用全新私有平台状态文件；不能通过删除既有数据绕过错误。

本地联合验证已通过两实际 OIDC subject、原生 HTTP/WebSocket 和持久生命周期，并修复实际安装缺陷。**真实模型执行与外部工具授权仍待验收，G3 未通过。** 参见[安装说明](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/installation/README.zh-CN.md)与[精确候选证据](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/installation/joint-validation-2026-09-29.md)；本地验证不代表允许发布。

每个 owner 一个独立 PVC，挂载 `/var/lib/dsh/data`，包含 `workspace/`、`home/`、`dsh/`。CPU/Memory 使用 Kubernetes 原生 requests/limits；存储仅一个申请容量，不承诺目录硬配额。正常启停保留该卷；退出、撤权和关闭平台不会删除用户数据。

## 运行候选

使用 Node 24+ 和已审查的精确平台 tarball。平台须能访问 Kubernetes API 和工作负载网络；前提包括 upstream agent-sandbox core、批准的 runtime RBAC、StorageClass、HTTPS OIDC、平台及环境域名的 TLS/DNS、固定 workload 镜像。安装及联合验证由 [MVP #104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104) 跟踪，源码检查不代表安装通过。

```sh
npm install --ignore-scripts /absolute/path/dsh-multi-tenant-0.10.0-alpha.1.tgz
./node_modules/.bin/dsh-multi-tenant start --config /private/config.json
```

配置只有七个顶层字段：`runtime`、`stateFile`、`adminSocket`、`oidc`、`members`、`host`、`port`。参见[候选配置](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/integration/distribution/config.example.json)。`runtime` 包含 Kubernetes server/CA/token 文件路径、namespace 前缀、domain、精确 image digest、单一 storage size/class、原生 resources 和平台 namespace。固定工作负载模板归 runtime 管理。集群凭据和 OIDC client secret 通过用户环境之外的文件引用注入；client secret 为 0600，状态和管理 socket 位于平台进程所有的 0700 私有目录，状态文件为 0600 且仅允许单 writer。

`members` 将精确 OIDC issuer/subject 映射为 `{tenantId, principalId}`。无需逐用户配置 namespace 或第二份环境清单。登录后平台自动预留稳定绑定；点击 **Enter / create** 首次创建，使用 **Inspect / resolve status** 查看原结果，**Stop** 停止，**Start stopped environment** 启动已确认停止的环境，Ready 后用 **Open environment** 进入。平台登录、环境访问会话和原生 DSH 会话彼此独立。操作页面显示结果或脱敏诊断及下一步，pending/unknown 不表示成功；查看结果后返回平台页进入 Ready 环境。

更新 `members` 后发送 SIGHUP，删除或改属成员会关闭已有 HTTP/WebSocket 连接。重载无效时撤销全部会话；其他配置需要重启。SIGINT/SIGTERM 关闭平台及访问连接，保留环境和 PVC。

管理员通过私有 Unix socket 操作，先 inspect，再提供持久保存的 allocation key 和 Sandbox UID：

```sh
dsh-multi-tenant inspect --socket /private/admin.sock --environment env-ID
dsh-multi-tenant stop --socket /private/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
dsh-multi-tenant resume --socket /private/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
dsh-multi-tenant delete --socket /private/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
```

Delete 必须有正面 Stopped 证据，仅删除运行资源并保留数据，绑定保持封锁供管理员检查，不自动重建。创建/启停/删除结果未知时只查询原绑定，不自动替换或重放。Sandbox/PVC 缺失或 UID 改变即拒绝访问。节点分区或 writer 停止未经证实须管理员处理，不建设自动恢复控制器。

## 开发与证据

使用清单固定的 pnpm，执行 `pnpm install --frozen-lockfile` 和 `pnpm release:check`，验证元数据、类型、单元/transport、构建和干净 tarball consumer，不发布。测试明确标注 Connector fixture；真实 runtime/集群/原生 DSH/OIDC/模型/工具的精确组合验收归 [#106](https://github.com/GuoMonth/dsh-multi-tenant/issues/106)。SDK 仅供可信平台代码消费，导出环境契约、绑定存储、控制、OIDC 和 ingress。

[容器配方](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/integration/distribution/Dockerfile) 安装同一份本地 tarball 并运行 CLI。本轮检查不包含 npm publish、公网镜像推送或对外 Release；用户最后 E2E 后决定发布。

容器 UID/GID 为 1000:1000；`GET /healthz` 无需登录且不调用 runtime/模型，仅表示平台本地已启动，不表示工作负载或模型健康。
