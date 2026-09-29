# RC2 单集群安装草稿

本目录对应 [平台 #111](https://github.com/GuoMonth/dsh-multi-tenant/issues/111)。
当前交付是经过离线验证的安装候选，不是已经通过真实安装的发行版。
平台与 workload 镜像尚未公开发布；fixture 的 `.invalid` 地址和重复字符 digest
明确不可安装。G2 后由唯一集群负责人固定 B/C 实际提交、包和本地镜像再验证。
DSH 固定 `0.2.0-rc.2` / `639ed015397290b3745d163aafe02ffee4aa3f84`。

## 前提

- 已有 Linux/amd64 Kubernetes，支持 NetworkPolicy 的 CNI、动态供应的 StorageClass，
  已安装 Ingress controller。参考环境为 Kubernetes 1.37、Calico 3.32.2、local-path。
  不安装集群、CNI 或 Ingress controller。Ingress controller 必须透明保留 Host、
  支持 HTTP/WebSocket，TLS 终止后转发到平台 8080；按管理员选定实现配置连接超时。
- Node 24、Helm 3、kubectl，明确 kubeconfig 和 context；安装者有创建 upstream core
  CRD/controller/RBAC 与平台资源的权限。只允许一个平台安装，固定 release `dsh-platform`。
  这是全新安装路径，没有旧 Alpha 升级、导入或自动恢复。
- 平台域名（例如 `dsh.company.example`）及 `*.env.dsh.company.example` 指向同一入口；
  TLS 证书覆盖平台和通配子域。平台 namespace 已存在，包含管理员供应的 TLS Secret
  `kubernetes.io/tls`（`tls.crt` / `tls.key`）与 OIDC Secret（默认 key `client-secret`）。
  Secret 内容不要写入 values、命令行、仓库或日志。
- OIDC issuer 必须 HTTPS，网络和 CA 信任可用；注册平台 client，回调为
  `https://<平台域名>/auth/callback`。members 显式映射 issuer/subject 到 tenantId/principalId；
  无需预建用户 namespace/PVC。
- 使用 B/C 通过验证的真实平台和 workload digest，节点能够拉取或已经导入。
  安装器不会把任意语法合法 digest 当作镜像可用证据；镜像故障会使有限 rollout 等待失败。
  没有内置 registry 凭据分发，参考路径使用节点可访问镜像或本地导入。

## 制品与权限来源

`charts/dsh-platform/files/sources.json` 记录 upstream core 原始文件和固定 digest 副本的哈希，
安装前检查副本只修改了 controller image。固定 core v1.0.3，只有上游单控制器。
`runtime-cluster-role.yaml` 是 B 的 `config/runtime/cluster-role.yaml` 逐字打包副本，
不能在此手工演进。D 转为可审查 PR 前核对 B 最终副本与哈希，并在 `runtimeRole.commit`
记录实际40位提交；E 使用该固定组合。不是另建 runtime Deployment 或第二控制器。

runtime 以平台 SA 身份按唯一模板供应 namespace、单 PVC、无集群 token 的用户 SA、
NetworkPolicy 和 upstream Sandbox。角色没有读取 Secret、写 Pod、删除 namespace/PVC
的权限；nodes/leases 只读用于 B 的停止证明。创建 namespace 的集群权限由管理员授予平台进程，RBAC 本身不能按名字前缀约束
namespace create。用户 Pod 不获得这些权限；平台身份和控制存储留在平台 namespace。

## 一条入口

先复制 `integration/installation/fixture.values.json` 为私有 values 文件，替换所有 fixture
字段，并按 `charts/dsh-platform/values.yaml` 设置少量默认额度。values 仅放 Secret 名称/key。
`storageSize` 是每用户唯一卷容量，默认 10Gi；原生 CPU/Memory requests 为 250m/512Mi，
limits 为 2/2Gi。平台的 `controlStorageSize` 默认 1Gi，只存平台 SQLite 绑定，不是第二个用户卷。
申请容量不等于目录硬配额，local-path 的宿主磁盘耗尽边界仍需管理员管理。

```sh
# 离线渲染（fixture 只允许在此使用；不访问集群）
node charts/install.mjs render --values integration/installation/fixture.values.json --namespace dsh-install-test

# G2 完成真实制品 pin 后；使用私有实际 values 与明确集群目标
node charts/install.mjs preflight --values /private/install.values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context dsh-mvp-rc2
node charts/install.mjs install --values /private/install.values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context dsh-mvp-rc2
```

入口先检查 schema、成员、制品校验和、namespace、Ready amd64 节点、StorageClass、IngressClass、
Secret key、TLS 有效期与主机覆盖、安装机 DNS 和 OIDC discovery，然后安装固定 core、等待 CRD/
controller、安装唯一 runtime role，最后 `helm install --wait` 平台。平台健康探针是 C 的
`GET /healthz`，无登录/模型请求。安装机预检不能证明 Pod 网络、证书信任、真实镜像或用户链路。
不使用 `--atomic` 自动删除资源：失败会保留现场和存储，输出固定脱敏错误；管理员核对原资源
后处理，不自动重装、换 allocationKey 或删卷。需要诊断模板时单独运行 `helm lint`，不打印 Secret。

平台 UID/GID 1000；init container 只把已引用的 OIDC Secret 复制到内存卷的私有 0600 文件，
主容器只读挂载，state/admin 目录0700。Secret 轮换后必须重建平台 Pod以刷新副本。
平台 projected SA token 可轮换，只有平台容器挂载。用户首次进入触发 runtime 供应，文件位于
`/var/lib/dsh/data/{workspace,home,dsh}`。用户在原生 DSH 页面配置模型/凭据及工具授权，
保存到自己的单卷；安装不引入共享模型 Secret 或新的模型协议。

## 故障与保留

| 现象 | 检查 |
| --- | --- |
| schema/镜像 pin 拒绝 | 用真实 digest；补全 OIDC、域名、TLS、存储和至少一个 member；不要带旧配置字段 |
| 候选未固定 | 使用经审查的 B RBAC 提交和 C/B 镜像，不用 fixture 安装 |
| Secret/TLS/DNS/OIDC 拒绝 | 检查 namespace、Secret key、证书范围/有效期、CA 和 issuer 注册 |
| Forbidden | 管理员核对安装权限和唯一 runtime role；不授予用户 token 或临时 cluster-admin |
| ImagePull/rollout 超时 | 核对真实 amd64 镜像可用性、Pod events、容量和平台脱敏启动错误 |
| PVC Pending/用户 Pending | 检查 StorageClass/CNI、调度事件与容量；不排队、不自动扩容 |
| 绑定缺卷/UID 不符/停止未知 | 保存原 namespace/UID 与失败诊断，交管理员处理；不要建空卷或第二 writer |

卸载平台 release 不默认停止/删除用户环境；用户 namespace/PVC 不属于 Helm。
平台控制 PVC 使用 `helm.sh/resource-policy: keep`，core/CRD/runtime role 由入口独立安装且保留。
保留控制状态是归属绑定所必需，不得通过删状态强行绕过未知结果。没有自动清理命令、备份/恢复或 HA 承诺。

## G2 后验收记录

第二操作者在独立安装 namespace，按此文档验证一次：两个真实 OIDC subject 首次进入各自
原生 DSH、HTTP/WS、跨用户拒绝、退出/撤权、真实模型读写文件和命令、至少一条工具授权、
正常启停及 Pod 重建保留文件/会话/配置、缺卷/换 UID 拒绝。记录平台/runtime commit、
Connector/平台包 integrity、三镜像 digest、集群/CNI/存储版本与实际命令结果；与 #106 共用证据。
本轮离线 fixture、Helm lint、schema 测试均不代替这些运行验收。
