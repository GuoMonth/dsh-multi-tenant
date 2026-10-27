# 管理 DSH 用户环境

[English](../en/operations.md) · [文档目录](index.md)

## 用户操作与数据

OIDC 登录后使用 Enter/create、Inspect、Open、Stop 和 Start。平台重启后，先通过 Inspect 解析已有绑定，再打开环境。模型配置和工具授权在原生 DSH 内完成。

| 操作 | 结果 |
| --- | --- |
| Stop | 中断整个环境中的模型调用、工具和后台命令 |
| Start stopped environment | runtime 确认原进程已停止后，使用同一数据卷启动 |
| 登出或移除成员 | 关闭访问，保留环境和数据 |
| 删除环境 | 要求确认停止；移除运行资源，保留 PVC、namespace 和网络策略 |
| Helm uninstall | 保留平台控制 PVC 和 runtime 创建的用户资源 |

用户数据位于 `/var/lib/dsh/data`：`workspace/` 保存文件，`home/` 保存工具和配置，`dsh/` 保存原生对话及凭据。平台 SQLite 绑定使用独立控制 PVC。这些保留行为不能代替备份。

## 管理员命令

先查询，再使用返回的环境 ID、分配键（allocation key）和 Sandbox UID 修改环境。Helm 部署中，在平台 Pod 内执行命令，私有 socket 路径为 `/tmp/platform/admin.sock`。

```sh
dsh-multi-tenant inspect --socket /tmp/platform/admin.sock --environment env-ID
dsh-multi-tenant stop --socket /tmp/platform/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
dsh-multi-tenant resume --socket /tmp/platform/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
dsh-multi-tenant delete --socket /tmp/platform/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
```

`resume` 启动已停止的用户环境。删除后原分配仍被阻止重建，供管理员检查；删除操作不会创建替代环境。结果未知时检查原分配。卷缺失或替换、资源 UID 变化、停止未经确认，都需要排查后再写入。

## 成员与平台重启

修改平台 ConfigMap 中的 `members`，等待内容投射到 Pod，再向平台进程发送 SIGHUP。成员被移除或重新映射时，已有 HTTP/WebSocket 连接关闭；重载内容无效时撤销所有会话。其他配置变化需要重启。OIDC Secret 轮换后重启平台 Pod，刷新私有副本。`/healthz` 仅检查平台本地就绪状态。

需要直接集成且能访问 Kubernetes API 与 Pod IP 时，可启动平台进程：

```sh
dsh-multi-tenant start --config /private/config.json
```

使用[配置示例](../../integration/distribution/config.example.json)。顶层字段为 `runtime`、`stateFile`、`adminSocket`、`oidc`、`members`、`host`、`port`。Secret/token/CA 通过文件引用；状态和 socket 目录权限为 0700，文件为 0600。每个绑定存储只运行一个平台进程。

## 排障

| 现象 | 检查 |
| --- | --- |
| 预检拒绝 TLS、DNS 或 OIDC | namespace、Secret key、证书覆盖范围/有效期、issuer 注册和私有 CA 信任 |
| Forbidden | 安装权限和平台 RBAC；用户环境不持有集群 token |
| ImagePull 或 rollout 超时 | 精确 amd64 镜像可用性、Pod 事件和调度容量 |
| PVC 或环境持续 Pending | StorageClass 供应、存储容量、CNI 和 Pod 事件 |
| 卷缺失、UID 变化或 StopUnverified | 原绑定、卷身份及原 Pod 是否终止；保留数据和控制状态 |

参考验证范围为单 Linux/amd64 节点、平台单副本、可信成员。高可用、节点分区恢复、受支持升级和备份另行建设，详见[验证报告](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.11.0-rc.1/validation.md)。
