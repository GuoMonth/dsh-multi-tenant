# RC2 MVP 环境与规划准备记录

2026-09-29。此记录只证明开发环境与准备工作，**不证明 DSH 0.2.0-rc.2 已接入或 MVP 已完成**。后续任务与放行门见 [执行计划](../plans/mvp-rc2.zh-CN.md)，需求见 [#104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104)。

## 已验证

| 项目 | 结果 |
| --- | --- |
| 本机资源 | 32 CPU，60 GiB RAM，准备时约 53 GiB 可用，磁盘剩余约 1.6 TiB |
| Docker / buildx | 29.8.1 / 0.37.1，普通用户可访问 daemon |
| kind / Kubernetes | 0.32.0 / v1.37.0，新建 `dsh-mvp-rc2`，节点 Ready |
| kubectl / Helm | 1.36.2 / 3.21.3 可执行 |
| Node / pnpm / Go | 24.21.0 / 仓库 11.7.0 / `dev-run go=1.27 -- go version` 为 1.27.1 |
| k9s | 官方 v0.51.0 已安装到用户目录，版本命令通过 |
| 浏览器 | 仓库 Playwright 1.58.2，Chromium Headless Shell 145.0.7632.6 启动并读取测试页标题通过 |
| CNI | Calico 3.32.2 的 node/controllers 均 Ready；实际可达目标由 NetworkPolicy 拒绝，再给客户端授权标签后可达 |
| PVC | local-path 64Mi 测试卷 Bound；正常替换 Pod 后 Pod UID 改变，PVC UID 和唯一文件标记保持 |
| 测试清理 | `mvp-preflight` namespace/测试 Pod/PVC 已删除；仅保留基础实验集群 |
| 旧实验集群 | 按用户明确指示删除 `dsh-issue82`，旧资源登记已释放；kind 仅剩 `dsh-mvp-rc2` |
| 文档 | 两仓库 diff 检查、修改文档本地链接通过；平台 README/npm 副本相同；runtime Source standards 通过 |

k9s 下载源为官方 `derailed/k9s` v0.51.0 Release；归档 SHA256 为 `c3752ad51a5a4015a113819c4eeb6e55a4d0e4b8e652494797532f6fc8161dd7`，与官方 asset digest 相同。来源清单位于用户工具目录。

集群节点镜像固定 `kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5`。Calico 原始官方 manifest SHA256 `a8c828a06a87c629a282ebbc424895b77f3a030251993e41ea400a743675bb02`，安装时显式设 `CALICO_IPV4POOL_CIDR=10.244.0.0/16`。

## 准备期间修正

- 初始默认 Calico 网段与现有 Docker kind 网段重叠，在没有业务数据的准备阶段重建为独立 Pod CIDR 10.244.0.0/16。
- kind 导入本机单架构镜像遇到缺少多架构内容，按已有方法使用 `docker save --platform linux/amd64` 和节点 containerd 指定平台导入。
- Alpine 镜像不含测试需要的 httpd，改用 BusyBox 1.37.0；测试 Pod 显式缩短终止宽限期并扩大等待上限，避免 30 秒默认终止窗口与测试超时竞争。最终 NetworkPolicy 与重建持久性验证通过。
- Playwright 安装器默认清理了被判为未引用的旧共享浏览器缓存；恢复原有浏览器 revision，并要求后续安装使用 `PLAYWRIGHT_SKIP_BROWSER_GC=1`。不修改其他项目包版本。

## 资源与未覆盖项

基础集群登记 ID 为 `dsh-mvp-rc2-kind-control-plane`，协调者持有集群写权限。私有 kubeconfig 位于 `/home/aigs/projects/runtime/dsh-mvp-rc2/private/kubeconfig`（0600），环境预检脚本与证据保存在该实验目录；不提交密钥。

没有安装新产品候选、OIDC/TLS 业务 fixture、模型/外部工具授权；这些按 A/D/E 阶段使用固定候选验证。不宣称新 DSH 兼容、跨节点可用性、备份恢复、存储硬配额、5 秒唤醒或 5000 在线。local-path 申请容量不作为硬限制证据。

Orca runtime 可用，版本匹配的 orca-cli/orchestration 指南已加载；当前只更新准备工作区和计划，没有创建 Run/Task/Dispatch 或启动 worker。两准备 PR 尚未合并，没有发布产品制品。
