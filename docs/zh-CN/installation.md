# 在 Kubernetes 安装 DSH multi-tenant

[English](../en/installation.md) · [文档目录](index.md)

部署组合为平台 0.11.0-rc.1、runtime 0.5.0-rc.1、DSH 0.2.1-rc.3。CLI 安装自带的 Helm Chart、上游 Agent Sandbox core v1.0.3 和 runtime RBAC。

## 准备

- Linux/amd64 Kubernetes，具备生效的网络策略、动态 StorageClass 和 Ingress controller。参考验证环境为 Kubernetes 1.37、Calico 3.32.2、local-path。
- 安装机上的 Node 24+、Helm 3、kubectl；明确的 kubeconfig/context，以及安装集群 CRD、控制器和 RBAC 的权限。
- 一个已创建的平台 namespace，其中放置 TLS Secret（`tls.crt`、`tls.key`）和 OIDC client-secret Secret。values 填写 Secret 名称和 key，密钥内容放在 Secret 中。
- 平台域名及 `*.env.<平台域名>` 指向同一 HTTPS 入口，证书覆盖两者。Ingress 保留 Host、支持 WebSocket，TLS 终止后转发到平台 8080 端口。公网明文 HTTP 关闭或重定向至 HTTPS。
- HTTPS OIDC issuer 和 client，回调地址为 `https://<平台域名>/auth/callback`。在 `members` 中将精确 issuer/subject 映射到租户和用户 ID。
- [发布清单](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.11.0-rc.1)中的平台和运行镜像 digest，节点能够拉取或已导入镜像。

私有 issuer CA 使用同 namespace 的 PEM Secret，通过 `oidc.caSecretName` 和 `oidc.caSecretKey`（默认 `ca.crt`）引用。安装机同时设置 `NODE_EXTRA_CA_CERTS=/private/issuer-ca.crt`。

## 配置并安装

将 [values.json](../examples/values.json) 复制为私有文件，替换占位内容。默认值见 [values.yaml](../../charts/dsh-platform/values.yaml)：用户存储 10Gi，CPU/内存 requests 为 250m/512Mi、limits 为 2/2Gi，控制存储 1Gi。PVC 申请容量的实际限制取决于存储后端；local-path 不提供目录硬配额。

```sh
npm install --global dsh-multi-tenant@0.11.0-rc.1
dsh-multi-tenant --version
dsh-multi-tenant render --values /private/values.json --namespace dsh-platform
dsh-multi-tenant preflight --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
dsh-multi-tenant install --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
```

`render` 离线渲染。`preflight` 检查目标集群、存储、入口、Secret key、TLS/DNS 和 OIDC discovery。`install` 随后安装固定资源并等待平台就绪。安装使用固定 Helm release 名称 `dsh-platform`，发现已有平台状态时拒绝全新安装。失败后检查原资源；超时会保留资源和存储。

## 验证

用两个 OIDC 用户登录，创建并进入不同环境。配置真实模型，读写一次性测试文件、执行命令，并调用已授权的 CLI 或 MCP。停止/启动、重建测试 Pod 后，核对 PVC UID、文件、会话和凭据仍保留。确认跨用户访问被拒绝，登出和移除成员会关闭访问。

排障和卸载行为见[运维](operations.md)。[发行验证报告](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.11.0-rc.1/validation.md)记录了受测组合与限制。
