# Cell MVP v1 候选配置

这是尚未发布的 P2 源码候选。已发布平台 `0.9.0-alpha.1` 和 runtime `0.3.0-alpha.1` 仍要求人工校准 `allocation.profiles[]`；已发布说明见[启动指南](quickstart.zh-CN.md)。npm `@latest` 仍选择已发布包，不接受本候选配置格式。候选 runtime 与 Connector 源码为 `ed914317e98a93752e8af4f7831c384fc1e92f13`，vendor tarball 的 SHA-256 为 `e9aaa0a364cd6277ea7038025e5ffb8a8613c4eebdbe0c424c56721d162ace10`。

候选只使用平台固定模板 `cell-mvp-v1`，每个 environment 必须使用同一模板。allocation 提供 runtime 镜像 digest、存储容量及可选 StorageClass/保留策略、CPU/内存 request 与 limit、tenant 到 namespace 映射、domain 和可选同 namespace credentials Secret。Kubernetes 资源由 runtime 校验并渲染。平台不接受 Pod 覆盖、`securityClass`、`profiles`、`expectedSpec` 或 `expectedPodSpec`。

从 [`config.candidate.example.json`](../../integration/distribution/config.candidate.example.json) 开始。其 `allocation.image: null` 是明确的未绑定标记，不是可用占位符：启动会拒绝它。只能替换为匹配 runtime 源码构建的精确 Cell 镜像 digest。不可使用公开的 `0.3.0-alpha.1` 镜像。包内清单故意将本地 Cell/Operator 镜像 digest 保持为空；本地候选部署时由管理员填入，不能当成已发布身份。

准备已发布[启动指南](quickstart.zh-CN.md)列出的 Kubernetes API、platform 模式 Operator、Gateway/TLS、执行策略的 CNI、存储、namespace/RBAC 映射、DNS 和 OIDC 前置条件。DSH 仍精确固定为 `0.1.5-rc.2`；出站网络策略仍由管理员负责。

## 渲染并应用匹配的 runtime 候选

使用上方精确源码提交的 runtime checkout，以及由该源码构建的本地 Cell、Operator 镜像 digest。在 runtime checkout 中运行：

```sh
test "$(git rev-parse HEAD)" = ed914317e98a93752e8af4f7831c384fc1e92f13
mkdir -m 0700 -p /private/candidate
kubectl kustomize config/platform > /private/candidate/operator.yaml
```

应用前编辑渲染结果：将 manager image 改为精确本地 Operator digest，并将 `--base-domain=cells.example.com` 改为管理员域名。审阅完整清单后显式应用：

```sh
rg -n 'image:|--base-domain=' /private/candidate/operator.yaml
kubectl apply --server-side -f /private/candidate/operator.yaml
kubectl -n dsh-system rollout status deployment/cell-operator --timeout=120s
```

私有平台配置中的 `allocation.image` 也必须设为同一 runtime build 的精确 Cell digest；不得把示例 null 值传给启动程序。

## 安装并启动平台 tarball

构建并打包已审查的平台源码，再在无 workspace 链接的干净 consumer 目录安装：

```sh
pnpm --filter dsh-multi-tenant build
mkdir -m 0700 -p /private/candidate /private/candidate-consumer
pnpm --filter dsh-multi-tenant pack --pack-destination /private/candidate
cd /private/candidate-consumer
npm init -y
npm install /private/candidate/dsh-multi-tenant-0.10.0-alpha.1.tgz
./node_modules/.bin/dsh-multi-tenant start --config /private/config.json
```

示例配置使用集群内 Kubernetes endpoint 与 ServiceAccount 文件路径。宿主机进程必须将这些值替换成可访问的 Kubernetes API endpoint，以及可读取的 CA/token 文件。若部署为 Pod，可在临时构建目录中用同一 tarball 构建 distribution 镜像：

```sh
mkdir -m 0700 -p /private/candidate-image
cp /private/candidate/dsh-multi-tenant-0.10.0-alpha.1.tgz integration/distribution/Dockerfile /private/candidate-image/
docker build -f /private/candidate-image/Dockerfile -t dsh-platform:candidate /private/candidate-image
```

并在配置路径挂载私有配置、状态文件、admin socket 目录、OIDC client secret，提供匹配的 Kubernetes ServiceAccount。上面的 `start` 命令描述容器入口行为；在普通宿主机直接运行时，不能使用示例中的集群内路径。

仅使用本地候选 tarball，不可替换为 npm `@latest`。启动会拒绝 null 或缺失的镜像身份。此候选尚未发布；以上是操作步骤，不是部署或端到端验收结果。

[English](cell-mvp-v1-candidate.md)
