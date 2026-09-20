# Cell MVP 集中回归 — 2026-09-20

本轮已跑通真实双用户 OIDC → 创建各自 Cell → 原生 DSH → DeepSeek 工具调用，并验证隔离、撤权、删除屏障和正常 Pod 重建持久化。主记录为 [#82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82)；本记录不代表完整发行/HA 验收。

## 验证组合

- runtime main：`3bcf68855bf16bcc5043058fa8133d2d2368efac`。
- 平台初始 main：`3fdcc6b043789b331baa44053d331bd1f3731d5a`；随后加入本 PR 的启动诊断修复，以重建平台镜像验证。
- vendor 源码 pin：`1612dc43a948dd6c5049a7d4a725e61a7bee1476`（已通过制品校验）。
- DSH：`0.1.5-rc.2` / `fb2c4b9e698e30edb738bca4cf0618587db7d203`。
- kind Kubernetes 1.37.0；Calico 3.32.2；Envoy Gateway 1.9.1；Dex 使用 runtime 固定镜像。单节点、平台单副本、standard local-path PVC。
- Chromium 使用专属 CA 信任库；浏览器、Node OIDC 和 Kubernetes API 均正常校验证书，没有跳过 TLS。
- `platform.cells.test` 与 `cell-<uid>.cells.test` 使用 HTTPS 443。真实模型为用户指定的 `deepseek-flash`、OpenAI-compatible endpoint。凭据仅在任务私有文件与该用户 DSH 私有状态中。

镜像/源代码最终身份见本文件末尾的制品记录。回归步骤与环境输入见 [runbook](../../integration/regression/README.md)。

## 已执行

| 边界 | 实际证据 |
| --- | --- |
| 两身份与原生入口 | Alice/Bob 经 Dex Code 流登录，分别创建不同 Cell；跨 owner 管理 API/环境 handoff 拒绝；原生 Web、host-only Secure/HttpOnly Cookie 正常 |
| 原生协议 | HTTP RPC、24 路并发、WS session/follow snapshot、HEAD/GET session.export、浏览器 Fetch 均通过；Bob 不可见 Alice 会话 |
| 真实模型 | 原生 UI 配置自定义 provider，上传文本；deepseek-flash 完成 write + 两次 read，生成文件并返回 Verified 标记；不是模型替身 |
| 平台撤权 | 父会话登出、SIGHUP 成员移除均关闭现有 WS、后续 RPC 401；另一用户仍可访问；恢复成员需要新登录 |
| 会话过期 | fixture 临时设 60000ms，真实计时验证现有 WS 关闭、后续 RPC 401；完成后恢复正常配置 |
| 绕过与伪造 | 无会话携带伪造身份头 401；跨 Origin / 缺少 Origin 写请求 403；系统 namespace 无标签 Pod、错误 namespace 带 platform 标签 Pod 均被 CNI 阻断 |
| 凭据/HTTP abort | 固定 vendor 制品的本地真实 socket 测试：移除平台/环境 Cookie、Authorization、身份及转发头；保留原生 Cookie；丢弃跨域/非原生 Set-Cookie；abort 关闭两端 HTTP 流；迟到校验不建立连接。此行是本地 socket 证据，不冒充集群抓包 |
| CRD 与归属 | 真实 API 拒绝修改/移除 allocation；同 key 去重、冲突 principal 拒绝、错误 UID 删除拒绝 |
| 模式冲突 | calibration Cell 遇到直达 HTTPRoute 后报 AccessModeConflict；外来 route 的 UID/spec 被保留，显式移除本测试 route 后恢复 |
| 未知写结果 | HTTPS 故障 relay 等真实 API 接受 POST/DELETE 后丢弃响应；分别返回 CreateOutcomeUnknown/DeleteOutcomeUnknown；原 key 查询找到创建实例；各一次写入，没有自动重发 |
| 精确管理员删除 | 普通用户 DELETE 405；错误 UID 不关闭活跃连接；正确管理员请求关闭已有 WS，删除记录持久化 accepted，但 writerState 仍 unverified |
| 删除不重建 | 删除后 route 421；重复管理员 DELETE 和用户 POST 只查询缺失原实例；SQLite 保持 delete-requested/accepted，平台重启后仍不重建 |
| 存储 | Retain 删除：Pod、私有 PVC 回收，data PVC 保留。Delete policy：两 PVC 均回收。正常重建 Alice Pod 后 Cell/PVC UID 不变，模型所写文件和原生会话仍在 |
| 平台停止/重启 | 停止平台前后所有剩余 Cell UID 不变；新登录后 Alice 绑定同一 UID，Bob 删除屏障不变；不承诺无感恢复 |
| 本地回归 | 平台 7 例、runtime 3 例、transport 2 例通过；Go accesscontract/controller 通过；vendor pin 与静态检查通过 |

## 发现与修正

1. 平台启动原先只返回泛泛的 `PlatformStartupRejected`。现在按配置、密钥、runtime、状态、OIDC、管理 socket、监听阶段提供固定的 nextAction、effect、状态和关联 ID；不透传可能带凭据的依赖异常。进程级测试确认畸形配置里的凭据不进入 stderr。最初触发原因是 fixture 违反“一 owner 一环境”，并非产品需扩展多环境。
2. kind 默认导入所有架构时遇到不完整镜像缓存；使用已有的本机架构导入路径。kubectl port-forward 会因无关 TLS reset 退出，改为任务专属 TCP relay。均是测试环境修正，未放松产品 TLS/Origin/模板检查。
3. 删除后路由已经移除，正确拒绝状态是 421；最初 fixture 只接受 401，已修正断言。CRD/HTTPRoute 的默认化字段也按 API 实际返回比较，不拿未默认化 YAML 判断误修改。
4. 固定 DSH 的内置模型目录与用户提供的模型名称不同，使用原生自定义 provider UI 获取实际模型目录并选择 deepseek-flash，没有修改 DSH pin 或偷偷替换模型。

## 有限结论与保留项

本轮证明当前固定组合的 MVP 核心链路。外部 credentialsRef Secret 的所有权/不删除行为有现有控制器测试与实现依据，本轮真实模型凭据走 DSH 原生私有存储，未另做外部 Secret 删除实测。OIDC 签名/state/nonce 的全面攻击矩阵、长时压力与配额边界、节点分区、强制删除、fencing、HA、跨版本恢复/迁移、其他后端及发行安装矩阵均不在本次通过声明中。

未知写的 runtime 结果来自真实 API 故障注入；平台未知提交屏障、并发互斥和重放规则另由 SQLite/运行时替身测试覆盖，不混称为完整崩溃矩阵。真实 WS 撤权与本地 HTTP 流 abort 分别记录，不将已缓冲完的 HTTP 响应当作正在执行的 writer。

任务资源和原始失败现场保留在本地 TASK 台账指定的专属 lab；模型 key、OIDC client secret、浏览器状态、完整鉴权 URL 不进入本记录或 Issue。故障 relay 已停用。Retain 卷不自动清理，不复用到新实例。
