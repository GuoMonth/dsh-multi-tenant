# Cell P3 集中验收

本目录提供 Issue #100 的浏览器回归 fixture。P3 使用一组精确的平台/runtime候选或已发布制品，在管理员已准备的 Kubernetes、OIDC、DNS/TLS、StorageClass 和执行 NetworkPolicy 的 CNI 上验收。它不创建 kind、构建或发布镜像，也不自动删除集群或数据。本轮结果见 [`cell-mvp-2026-09-22.md`](../../docs/evidence/cell-mvp-2026-09-22.md)，并同步主 Issue；旧证据见 [`cell-regression-2026-09-20.md`](../../docs/evidence/cell-regression-2026-09-20.md)，不代替这轮新组合结果。

## 输入与本地准备

验收前先确认 P1 runtime 与 P2 固定模板实现已进入同一候选组合。记录平台/runtime commit、DSH 版本、Operator/Cell/平台镜像 digest、npm tarball integrity、Connector 来源，并分别标明已发布或候选。未形成组合时不跑旧组合冒充 P3。

从干净 consumer 安装记录的平台 tarball。本轮 source-candidate 使用[候选指南](../../docs/reference/cell-mvp-v1-candidate.zh-CN.md)中同源 runtime `config/platform` 渲染清单；不能用旧 runtime npm 0.3 安装新模板。只有未来发行已绑定新 runtime npm 时，才使用该精确制品的 `release`、`manifests` 命令。候选与发行始终分别记录。

```bash
export DSH_REGRESSION_HOME=/absolute/task-owned/lab
mkdir -p "$DSH_REGRESSION_HOME/private" "$DSH_REGRESSION_HOME/evidence"
chmod 700 "$DSH_REGRESSION_HOME" "$DSH_REGRESSION_HOME/private"
npm ci --ignore-scripts --prefix integration/cell-platform
npm ci --ignore-scripts --prefix integration/regression
npm test --prefix integration/cell-platform
npm run test:transport --prefix integration/regression
```

`private/` 保存 kubeconfig、CA、OIDC client secret、平台 `config.json`、模型配置和浏览器 storageState，权限设为 0600；不得提交或打印。OIDC subject 必须从这次使用的 IdP 明确核对。模型 key 只通过 DSH 原生私有设置提交，不放在命令行、URL、截图或证据 JSON。

## 无校准部署

1. 管理员提供可复用的集群，安装启用 NetworkPolicy 执行的 Calico（或声明并验证等价 CNI）、Gateway API controller、StorageClass、OIDC issuer 和有效 DNS/TLS。创建独立系统 namespace、两个租户 namespace、浏览器/证书测试配置。该 P3 路径不创建 `calibration` namespace 或 profile Cell。
2. 按上述候选或已绑定发行路径渲染并审阅 manifests；应用 Operator/CRD、平台访问模式需要的 Gateway 资源、管理员 egress 策略示例（见下文）。记录安装后的镜像 digest 与实际 manifest SHA。Cell 镜像 digest 必须和该 runtime manifest 以及平台 pin 一致。
3. 从平台 P2 候选配置样例 [`integration/distribution/config.candidate.example.json`](../distribution/config.candidate.example.json) 生成私有平台配置。使用 `cell-mvp-v1`：allocation 直接提供固定 template、精确 Cell image digest、Storage 与 Resources 参数，environment 只引用 `cell-mvp-v1`；保留两个 namespace 映射、OIDC issuer/subject、平台 origin 和域名。只有把 `image: null` 替换为同一 runtime 候选的精确 Cell digest 后配置才可启动。不要生成/填写 `expectedSpec`、`expectedPodSpec`，不要运行 `capture-profile.py`，不通过先创建一个 Cell 反向捕获配置。
4. 以候选/已发布平台制品 `start --config <private config path>` 启动平台，应用 Gateway/TLS 路由。清单中平台 SQLite/PVC 与管理 socket 保持系统 namespace 私有。浏览器使用专属 profile 和 CA 信任，不设置 `ignoreHTTPSErrors`。
5. 保持同一精确制品组合完成下面的两用户浏览器步骤。失败时保留专属证据和数据，不自动清理 PVC/namespace；记录实际操作步骤、用时和所有绕路。

固定 Cell 启动环境必须把 `DSH_PERMISSION_MODE` 设为 `danger-full-access`。固定 DSH composition 将该值用于 bash sandbox policy、approval policy 和 permission presets 的新会话默认值；因此原生 DSH `bash` 不再依赖容器内的第二层文件 sandbox runner。该默认仅在创建会话时写入权限事件，不会升级已有会话；本 gate 使用本轮新建的 Cell 和会话，不要求迁移历史权限状态。上游默认 `workspace-write` 则尝试 Linux bwrap，并可回退到 Landlock；本验收没有假定或探测这两种 runner 在 Cell 镜像中的可用性。此设置不授予 Pod 新权限，也不替代 Kubernetes/CNI 网络边界；平台仍须按租户撤权，并由 NetworkPolicy 管理出站。不要通过修改模式或 sandbox policy 绕过工具失败。

## 浏览器验收顺序

先保持专属 CDP Chromium 进程运行（默认 `127.0.0.1:30444`），用 `core.cjs` 登录两个真实 OIDC subject，各自显式创建/查询 Cell 并进入原生 DSH。接着按顺序运行：

```bash
node integration/regression/browser/core.cjs
node integration/regression/browser/protocol.cjs
# 原生 DSH 设置中配置真实模型；模型凭据只输入私有设置。
node integration/regression/browser/live-model.cjs
node integration/regression/browser/user-command.cjs
# 使用任务专属部署名与实际 Alice namespace。Pod 检查会正常删除并重建该 Pod，保留 Cell/PVC。
export DSH_REGRESSION_PLATFORM_DEPLOYMENT=platform-mvp
export DSH_REGRESSION_ALICE_NAMESPACE=mvp-tenant-a
node integration/regression/browser/pod-recreation.cjs
node integration/regression/browser/lifecycle.cjs
node integration/regression/browser/negative.cjs
node integration/regression/browser/delete.cjs
# 管理员先正常重启本次平台 Deployment 并等待 Ready，再运行：
node integration/regression/browser/restart.cjs
```

- `core`：两个 OIDC subject、每人自己的 Cell、跨 owner 拒绝、原生入口和 host-only cookie 属性。
- `protocol`：原生 HTTP RPC、并发请求、WebSocket snapshot、HEAD/GET export 和会话隔离。
- `live-model`：真实模型处理用户文件与上传文本；本轮还需刷新页面后确认同一用户文件仍可读取。
- `user-command`：通过原生 DSH `bash` 工具启动 Node 子进程，让子进程在 DSH 当前用户 workspace 写文件并输出唯一标记；刷新页面后再经 `bash` 读取相同文件。脚本等待输入框可编辑，并展开本次 turn 和 Bash 卡，再检查对应 `[data-sample="bash"][data-state="ok"]` 工具结果卡中的命令片段、stdout 独立 nonce 行和 DSH 非零退出/信号/超时标记。写入命令在 Node 子进程 `status === 0` 后才输出 success nonce，shell 也只在 Node 父进程退出 0 后输出它；结合固定 DSH renderer 未显示失败标记，证据记录 `exitCode: 0`。该值依据真实工具结果行为推得，UI 没有单独暴露结构化 exitCode 字段。file tool、assistant 回复或 `kubectl exec` 均不算此项。
- `pod-recreation`：正常替换本次 Alice Pod，要求 Pod UID 改变、Cell 与两 PVC UID 不变，工作区文件和既有原生 session 仍可读取。
- `lifecycle`：父会话登出关闭既有 WebSocket 并拒绝后续请求，另一用户不受影响。
- `negative`：伪造身份头、跨 Origin、缺少 Origin 的写请求拒绝。
- `delete` / `restart`：使用当前 P3 对应的撤权和持久化边界；只在组合契约要求时执行旧删除回归。普通 Pod 重建应保留本轮文件与会话。

现有脚本的起始 origin、environment id、fixture 浏览器数据路径需要按 P2 配置更新。`core.cjs` 完成时创建 `private/alice-browser.json`、`private/bob-browser.json`；后续页面脚本使用专属 Chromium 上下文。不要分享完整 Playwright Call log、Cookie、ID Token 或认证 URL。

## CNI egress 验收

runtime 自动创建的 Cell NetworkPolicy 只约束 ingress；它不阻止 Cell 出站。因此由集群管理员在每个租户 namespace 额外应用 [`network/egress-policy.example.yaml`](network/egress-policy.example.yaml) 的 egress-only 策略。它按 runtime Cell labels 选择 Cell Pod，默认拒绝其他出站，只开放 kube-system CoreDNS 的 TCP/UDP 53 和管理员填入的公网上模型 API IP 的 TCP 443。此示例不是 runtime 安装的一部分，也不是通用生产策略。

将 `REPLACE_WITH_MODEL_PUBLIC_IPV4/32` 替换为验收时解析出的全球可路由地址；为所有实际使用的地址分别添加 peer，需要 IPv6 时也添加全球单播 IPv6 peer。不要把 ClusterIP/Service CIDR、节点网段、RFC1918、loopback、link-local 或私网目标放入模型 allowlist。若使用 NodeLocal DNS，应将 peer 换成该集群规定的 DNS 目的地，仍只开 DNS 端口。记录精确策略、DNS 和目标地址；动态 API 地址变化后策略必须按管理员流程更新。

从每个 Cell 运行短超时探测；此检查只记录网络路径，不作为用户命令项证据。先从可信的系统 namespace 验证拒绝目标确实可达，否则失败可能只是目标不存在。下面从该 Cell 容器把本地探测脚本通过 stdin 传给 Node，不写入镜像或 PVC：

```bash
kubectl exec -i -n tenant-a "$CELL_POD" -- node - \
  "$MODEL_HTTPS_URL" \
  "$KNOWN_REACHABLE_PLATFORM_SERVICE_URL" \
  "https://kubernetes.default.svc:443/" \
  "http://$KNOWN_REACHABLE_PRIVATE_CONTROL_IP/" \
  < integration/regression/network/egress-probe.mjs
```

`egress-probe.mjs` 只发无凭据 HEAD；允许目标必须完成 DNS、TLS 和 HTTP 首部（401/404 等响应也证明网络连通），拒绝目标必须 DNS 可解析且在 5 秒内以路由/策略丢包错误退出。cluster/service、private/control-plane 等主要拒绝目标需从可信 namespace 证明可达。link-local 等本来就不可达的目标只能作为附加观察，不作为隔离证明或验收前置。脚本不会据不可达目标推断 CNI 拦截。

若管理员网络使用透明代理或 fake-IP DNS，应单独记录该必要出口及其信任前提，仅允许已核实的精确地址与端口，并用原模型 hostname 完成 TLS 校验和真实调用；不能开放整个私网/benchmark 网段。普通公网示例和 `egress-probe.mjs` 的全球地址检查不适用于这种网络，需管理员明确适配；本轮环境差异见实际报告。

## 有限本地 transport 回归

`npm run test:transport --prefix integration/regression` 使用固定 vendor Connector 与真实本机 TCP socket 检查凭据头清洗、迟到地址校验撤权、长 HTTP 流客户端取消及两端关闭，并在 Linux 上用任务专属 TCP backlog 验证真实 pending connect 有界退出。它不连接 Kubernetes 或真实 DSH，不代表集群证据。Connector 的 connect/response-header/late-Upgrade deadline 由 runtime 独立模块测试和实现验收；连接超时测试使用单独的 `127.0.0.30:8080`，其余平台 socket 使用 `127.0.0.2:8080`，运行前检查端口占用。正常长 WebSocket/HTTP stream 不设全程总时长。

每次报告区分候选源码检查、真实 consumer 制品、真实集群/CNI、浏览器/DSH 工具和本地 socket 结果。把产品缺陷、管理员环境前提、不支持能力分开记载。HA、故障转移、长时压测、恢复/迁移、兼容和其他后端不属于本 gate。
