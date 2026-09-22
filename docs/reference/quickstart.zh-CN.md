# Cell alpha：安装与管理

本指南描述已发布的 `dsh-multi-tenant@0.9.0-alpha.1` 平台包和 `dsh-isolated-runtime@0.3.0-alpha.1` 发行物。平台包运行 OIDC/用户协议服务；runtime npm 输出固定的 Cell/Operator 发行信息和部署清单。两者都不会创建 Kubernetes 集群。

## 前置条件

管理员需准备一个 Kubernetes 集群、platform 模式 Cell Operator、Gateway/TLS、实际执行 NetworkPolicy 的 CNI、存储、namespace 映射、RBAC 和 OIDC Provider。平台 origin 与 `cell-<UID>.<site-domain>` 都应经平台路由。平台需可访问 Kubernetes API 和 Cell Pod IP；可在集群内运行，或自行提供这两类网络可达性。使用 [`cell-release.json`](../../packages/multi-tenant/cell-release.json) 中固定的 runtime/DSH/镜像组合；平台镜像也按 digest 固定。

已发布 Operator 配置要求平台 Pod 位于 `dsh-system`（Operator 的 `--system-namespace`），并带有 `dsh.isolated.io/access: platform` 标签；生成的 Cell ingress 策略同时要求这两个条件。该 namespace/标签不可由租户控制。集群外进程仅能路由 Pod IP 还不够，管理员还须提供同等受限并实测的访问策略。[平台 Deployment fixture](../../integration/regression/platform.yaml)可参考 namespace 与标签；其中测试镜像、域名和私有配置必须替换，不能原样应用。

## 部署 runtime 资源

公开 runtime npm 包只输出固定资源。审阅清单及目标集群后再部署：

```sh
npx dsh-isolated-runtime@0.3.0-alpha.1 release
npx dsh-isolated-runtime@0.3.0-alpha.1 manifests > operator.yaml
# 替换示例 base-domain，核对 namespace/RBAC、kubeconfig context 和固定镜像后再应用。
kubectl apply --server-side -f operator.yaml
kubectl -n dsh-system rollout status deployment/cell-operator --timeout=120s
```

`release` 和 `manifests` 只输出信息/YAML；`kubectl apply` 才是管理员明确执行的部署动作。runtime npm 不会启动第二个面向用户的服务；过去的 standalone 启动器不是当前平台入口。

## 配置并启动平台

从 [`config.example.json`](../../integration/distribution/config.example.json) 开始，按固定集群替换所有 `REPLACE_*` 和 profile 占位内容。特别是 `allocation.profiles[].expectedSpec` 与 `expectedPodSpec` 必须匹配 API 默认化后的、已批准的 Cell 和 Pod 模板。人工校准仍是已知部署负担；Issue #99 提出的简化尚未发布。不能把示例占位对象直接当成生产 profile，也不能放宽比较。状态数据库和 admin socket 放在 Cell 存储以外的私有目录；OIDC client secret 放在权限为 0600 的文件中。

当前版本的校准方法：先用管理员认可的固定Cell spec创建并等待Ready，再采集API默认化后的Cell spec及StatefulSet `spec.template.spec`，仅将实例UID和origin替换为 `${INSTANCE_ID}` / `${ORIGIN_HOST}`。参考 [capture-profile.py](../../integration/regression/capture-profile.py) 的采集逻辑；其测试身份、域名和资源不是通用配置，不能直接套用。P2完成前保留这条实际可用路径。

使用 Node.js 24+ 前台运行已发布平台包：

```sh
npx dsh-multi-tenant@0.9.0-alpha.1 start --config /private/config.json
```

记录并审阅精确版本后，部署安装时可选择 `latest` 通道；不要在每次重启时重新解析 `latest`。SIGINT/SIGTERM 停止平台但保留 Cell 和数据；SIGHUP 重载成员映射。重启后需要重新登录，未知创建不会自动重放。

## 查询与删除

在可访问私有 Unix socket 的平台主机执行管理员命令。删除前先查询，并使用该环境返回的精确 allocation key 和 identity：

```sh
npx dsh-multi-tenant@0.9.0-alpha.1 inspect --socket /private/admin.sock --environment alice-main
npx dsh-multi-tenant@0.9.0-alpha.1 delete --socket /private/admin.sock --environment alice-main \
  --allocation-key ORIGINAL_KEY --identity EXACT_UID
```

删除是明确操作，会按保留策略影响 Cell 所拥有的资源。API 接受删除请求或资源缺失，都不能证明 writer 已停止。结果未知时查询原 key；不要换 key 重放，也不要删除状态数据库来强制重建。见 [R6 删除与数据边界](../design/r6-deletion.md)。

## 证据与限制

[2026-09-20 回归报告](../evidence/cell-regression-2026-09-20.md)记录了真实集群、浏览器、模型验证及其边界。[alpha 制品检查](../evidence/alpha-delivery-2026-09-20.md)是发布前历史快照；公开包安装与发行结果见 [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82) 和 [npm 发布记录](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.9.0-alpha.1/npm-publication.json)。这些是有限 MVP 检查，不是完整 OIDC 攻击矩阵、压力、HA、升级、迁移或恢复认证。后续源码/任务状态见 [roadmap](../roadmap.md)，不据此改写本版本制品能力。
