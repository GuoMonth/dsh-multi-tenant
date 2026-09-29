# DSH multi-tenant

[English](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/README.md)

为每位授权用户提供持久的 AI 工作环境，直接使用 DeepSeek Harness 原生界面。员工通过 OIDC 登录，进入自己的环境；正常停止、启动和 Pod 重建后，文件、对话、工具安装及凭据继续保留。

**Alpha · Kubernetes · Linux/amd64 · DSH 0.2.0-rc.2 · 平台单副本。** 每用户一个独立 PVC，面向可信组织成员。当前不承诺备份、高可用或跨节点灾难恢复。

## 让 AI 帮你安装

将下面这段话交给 AI 助手：

> 帮我安装当前发行版 DSH multi-tenant。先阅读 https://github.com/GuoMonth/dsh-multi-tenant/blob/main/packages/multi-tenant/AI.md ，按其中指引使用对应版本的安装文档。修改集群前，核对 Kubernetes context、OIDC、DNS/TLS、存储和镜像可用性。缺配置先向我询问，凭据只通过私有文件提供，保留已有数据，安装后验证双用户访问和数据持久性。

[AI 安装引导](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/packages/multi-tenant/AI.md) 同时随 npm 包以 `AI.md` 分发，包含输入清单、安装顺序、验收和故障处理。

## 安装

准备已有 Kubernetes 集群、支持 NetworkPolicy 的 CNI、动态 StorageClass 和 HTTPS Ingress；配置 OIDC client、平台域名与环境通配域名、TLS Secret 和成员映射。安装机需要 Node 24+、Helm 3、kubectl。安装器部署固定的平台及上游控制器，无需逐用户准备 namespace。

```sh
npm install --global dsh-multi-tenant@0.10.0-alpha.1
dsh-multi-tenant --version
dsh-multi-tenant preflight --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
dsh-multi-tenant install --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
```

按[安装文档](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/installation/README.zh-CN.md)准备私有 values 文件，平台和 workload 镜像使用[同版本 Release](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.10.0-alpha.1)记录的 digest。npm 包自带安装器和 Chart；安装 npm 包本身不会启动服务或创建集群。

## 使用

打开平台地址并登录。**Enter / create** 分配环境，**Inspect / resolve status** 查询状态，Ready 后通过 **Open environment** 进入原生 DSH，在其中设置模型和授权工具。**Stop** 会中断整个环境，包括工具和后台命令；**Start stopped environment** 使用原数据卷恢复访问。

用户 PVC 内固定为 `/var/lib/dsh/data/workspace`（文件）、`home`（用户工具和配置）、`dsh`（对话与原生凭据）。CPU/Memory 使用 Kubernetes requests/limits；存储申请容量是否为硬限制取决于存储后端。登出和移除成员会撤销访问，不删除数据。

## 两个项目的分工

| 组件 | 职责 | 入口 |
| --- | --- | --- |
| **dsh-multi-tenant** | OIDC 登录、成员、授权、环境绑定、HTTP/WS 准入、CLI 与 Helm 安装 | 本仓库及 npm 包 |
| **[dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime)** | 同进程 Connector、固定运行镜像、namespace/PVC 身份与显式启停 | [runtime 契约](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/docs/design/environment-contract.zh-CN.md) |
| 上游 Agent Sandbox core | 将 Sandbox 资源调谐为 Pod 和 Service | 由安装器按发行固定版本安装 |
| DeepSeek Harness | 原生界面、对话、模型调用、文件和工具 | 运行于每个用户环境内 |

部署从本仓库开始。内部 Connector 已打包进平台，不需要单独部署 runtime 服务。资源生命周期开发去 runtime 仓库；用户授权和安装开发在本仓库。

## 运维与开发

平台进程使用 `start --config /private/config.json` 启动。管理员通过私有 Unix socket 和精确分配/实例身份执行 `inspect`、`stop`、`resume`、`delete`。`resume` 启动用户环境；`start --config` 启动平台进程。详见[运维说明](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.md)。

停止未经证实、卷缺失或资源 UID 变化时拒绝访问，需要检查原实例。删除已停止环境会保留 PVC；卸载平台保留控制存储和用户资源。持久存储不等于备份。

- [安装与排障](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/installation/README.zh-CN.md)
- [AI 安装引导](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/packages/multi-tenant/AI.md)
- [开发与本地检查](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONTRIBUTING.md)
- [发行说明与制品](https://github.com/GuoMonth/dsh-multi-tenant/releases)

MIT 许可证。
