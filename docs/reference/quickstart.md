# Cell alpha：已有 Kubernetes 的启动入口

本指南针对 `0.9.0-alpha.1` 源码候选。发布前 npm latest 仍可能指向旧 Docker 演示；不能用旧包验收本指南。当前集成回归已通过，公开镜像绑定和正式发布另行执行。

## 1. 管理员准备运行时

- 单个已配置 K8s 集群，Gateway API、执行 NetworkPolicy 的 CNI、可用 StorageClass、租户 namespace。
- 固定 runtime commit、DSH 基线和 Cell/Operator 镜像 digest，见包内 `cell-release.json`。源码候选的镜像字段为空，不能当作可部署发行版。
- 使用 runtime 的 [`config/platform`](https://github.com/GuoMonth/dsh-isolated-runtime/tree/main/config/platform)，配置 `--access-mode=platform --base-domain=<site-domain> --system-namespace=dsh-system`。不要安装 standalone authorizer 或用户直达 Cell 的 route；现有模式冲突必须显式处理，不自动迁移。
- HTTPS 平台 origin 与 `cell-<UID>.<site-domain>` 使用同一受控 site domain，443 端口。Gateway 将它们交给平台 Service；只允许系统 namespace 内带平台标签的 Pod 访问 Cell。平台需要直达 API 和 Pod IP，因此推荐在 K8s 内运行。
- OIDC Code+PKCE，固定 callback `https://<platform-host>/auth/callback`，issuer 必须 HTTPS 且 CA 受信任。管理员维护可信 `(issuer, subject) → owner` 映射；不从用户输入推导权限。

## 2. 配置与状态

配置结构见 [`integration/distribution/config.example.json`](../../integration/distribution/config.example.json)，所有占位符必须替换。它不含可用模型或登录凭据。

`allocation.profiles` 必须取自该固定运行时在当前集群创建并 Ready 的校准 Cell：记录 API 默认化后的 `spec` 和 StatefulSet `spec.template.spec`，仅将 Cell UID、`cell-UID.domain` 替换为 `${INSTANCE_ID}`、`${ORIGIN_HOST}`。不要用空 profile 或放宽比较绕过模板拒绝。runtime 拥有模板验证；平台只配置已验收 profile。回归 fixture 的 [capture-profile.py](../../integration/regression/capture-profile.py) 展示采集方法，但其固定 Dex/测试用户不是部署配置生成器。

每个 owner 首期只配置一个环境。`stateFile` 与 `adminSocket` 放在平台专用目录（0700），OIDC client secret 文件0600；SQLite/PVC 不进入用户 Cell。配置中的路径在平台进程内解析，使用绝对路径。模型凭据在各用户 DSH 私有设置里配置，不放在平台配置或 README 中。

## 3. 构建/启动

```bash
# 源码候选，本仓库根目录；使用 packageManager 固定的 pnpm
pnpm install --frozen-lockfile
pnpm build
mkdir -p dist/npm
pnpm --filter dsh-multi-tenant pack --pack-destination "$PWD/dist/npm"
# 用同一个 npm tarball 构建平台容器，无需复制源码/vendor
# 在已有 API/Pod 网络的 Node 24 主机也可安装 tarball 后直接执行 CLI
docker build -f integration/distribution/Dockerfile -t YOUR_PLATFORM_IMAGE dist/npm
```

推送平台镜像后固定 digest。[platform.yaml](../../integration/regression/platform.yaml)、[tenant-rbac.yaml](../../integration/regression/tenant-rbac.yaml)、[gateway.yaml](../../integration/regression/gateway.yaml) 是已验证的部署参考：替换平台镜像、域名、namespace、StorageClass、TLS 引用及 Secret，先渲染审阅再应用。单副本/Recreate，保留平台状态 PVC。引用清单目前仍是 fixture，不能不改就用于公共服务。容器默认运行：

```bash
dsh-multi-tenant start --config /private/config.json
# 本次制品发布后，对应的 npm 获取入口：
npx dsh-multi-tenant@latest start --config /private/config.json
```

无需两个 npm 命令同时启动；runtime Operator 由管理员部署，平台 npm 是用户协议服务入口。记录 `dsh-multi-tenant --version` 和实际镜像 digest。SIGTERM/SIGINT 保留 Cell/数据，SIGHUP 只重读成员配置；重启后用户重新登录。

## 4. 查询与明确删除

在平台容器内或同一私有 socket 所在主机执行：

```bash
dsh-multi-tenant inspect --socket /private/admin.sock --environment alice-main
# 仅在管理员明确要删除时，使用查询返回的原分配 key 与精确 instance identity
dsh-multi-tenant delete --socket /private/admin.sock --environment alice-main \
  --allocation-key ORIGINAL_KEY --identity EXACT_UID
```

普通用户接口不提供 DELETE。超时/unknown 后检查原 key；不换 key 重试、不删除数据库强行创建。accepted、API 对象缺失、writer 已停止是不同事实。Cell data/private-state/外部 Secret 的清理边界见 [R6](../design/r6-deletion.md)。

## 5. 内测最小检查

首次部署核对：两个真实 OIDC 身份各自进入原生 Web；一次真实模型文件 write/read；跨 owner/绕过入口拒绝；登出关闭已有连接；平台退出不删除 Cell，重启后新登录绑定原 UID。依据变化选择验证，不重复扩大历史 HA/升级门禁。已有完整证据见 [回归报告](../evidence/cell-regression-2026-09-20.md)，本次打包增量见 [交付验证](../evidence/alpha-delivery-2026-09-20.md)。
