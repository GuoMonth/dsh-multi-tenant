# Cell 集中回归

这是固定版本、单集群、双 OIDC 用户的集成 fixture，不是安装发行器。只操作任务专属集群；保留失败现场，测试命令不自动删除集群或卷。2026-09-20 的实际结果见 [回归记录](../../docs/evidence/cell-regression-2026-09-20.md)。

## 环境与输入

需要 Docker、kind、kubectl、Node 24、Python 3、openssl、受信任的 Chromium，以及同级固定提交的 `dsh-isolated-runtime` checkout。平台源码、vendor/source.json、DSH pin 和实际镜像 digest 均需记录。

```bash
export DSH_REGRESSION_HOME=/absolute/task-owned/lab
mkdir -p "$DSH_REGRESSION_HOME/private" "$DSH_REGRESSION_HOME/evidence"
chmod 700 "$DSH_REGRESSION_HOME" "$DSH_REGRESSION_HOME/private"
npm ci --ignore-scripts --prefix integration/cell-platform
npm ci --ignore-scripts --prefix integration/regression
npm test --prefix integration/cell-platform
npm run test:transport --prefix integration/regression
```

本地 transport 测试占用 `127.0.0.2:8080`，先检查冲突。它验证固定 vendor 制品的凭据清洗、迟到校验取消和正在传输的 HTTP abort，不冒充真实 DSH/集群证据。

私有目录保存 kubeconfig、CA、OIDC client-secret、config.json、模型凭据和浏览器 storageState；不得提交。测试账号来自 runtime 的 `test/e2e/phase2/dex.yaml`，仅用于本 fixture。模型配置为 `private/model.json`，字段 `apiKey`、`baseURL`、`model`，权限 0600；不要将 key 作为命令行参数。

## 部署顺序

1. 创建专属 kind 集群和本地 registry。复用 runtime 的 `test/e2e/phase2/kind-template.yaml`、`hack/lib/kubernetes-test.sh`、`reference-versions.sh` 和 `browser-stack.sh` 的基础设施函数。使用 `DSH_LOCAL_RUNTIME=1`，只导入本机架构；不要运行会在退出时销毁集群的完整历史 gate。
2. 安装 Calico、固定 Envoy Gateway 与当前 Cell CRD。由当前源码构建 operator/Cell 镜像；推入 registry 后以 digest 部署。operator 从 `config/default` 部署，参数为 `--access-mode=platform --base-domain=cells.test --system-namespace=dsh-system`。不要装 standalone authorizer 或 Cell 直达路由。
3. 创建 `dsh-system`、`tenant-a`、`tenant-b`、`calibration`。Dex 保留两个测试账号，将 client `dsh-browser` 回调改为 `https://platform.cells.test/auth/callback`；client secret 写私有文件与 Secret，CA 为测试根。issuer 为 `https://dex.dsh-system.svc:15556/dex`。
4. 在 calibration 创建名为 `profile` 的 Cell，使用实际 Cell digest、1Gi standard、Retain。等待 Ready 后执行 `python3 integration/regression/capture-profile.py`。它捕获 API 默认化后的 Cell spec、StatefulSet Pod template，并且只将实例 UID/authority 替换为契约占位符。检查 profile 后再部署平台，不能放松模板校验来使测试通过。MVP 每个 owner 只配置一个环境。
5. `docker build -f integration/regression/Dockerfile -t <task-platform-image> .`；推入 registry，记录 digest。将 `platform.yaml` 的 `PLATFORM_IMAGE` 替换为该 digest。建立 `platform-config` Secret（config.json、client-secret、ca.crt），分别在 tenant-a/b 应用 `tenant-rbac.yaml`，再应用平台清单和 `gateway.yaml`。SQLite/PVC 和管理 socket 不进入用户 namespace。
6. 暴露 Gateway 至回环地址 443、Dex 至 15556。平台固定 origin 没有自定义端口。普通进程不能绑定 443 时，使用任务专属 TCP relay；本轮使用 node namespace → Gateway Service 的 TCP 转发，避免 kubectl port-forward 在无关 TLS reset 时退出。
7. 浏览器使用专属 profile/CA 信任库、CDP `127.0.0.1:30444`、`--host-resolver-rules=MAP *.cells.test 127.0.0.1,MAP dex.dsh-system.svc 127.0.0.1`。Node 平台通过 `NODE_EXTRA_CA_CERTS` 信任 Dex。**不使用 ignoreHTTPSErrors**。用 agent-browser 的 `open`、`snapshot -i`、`screenshot` 核验实际页面。

## 按状态推进验证

这些脚本共享一次测试的数据；顺序有意义，删除后的环境不能通过重跑 core 自动恢复。CDP 浏览器应由独立进程保持运行。脚本不打印 Playwright 的完整 Call log（其中可能带 Cookie）；其他工具日志和完整失败响应仍须检查后再分享。

```bash
node integration/regression/browser/core.cjs
node integration/regression/browser/protocol.cjs
# 原生 UI 添加 regression-deepseek 自定义 provider，配置 deepseek-flash，保留 Models 设置面板。
node integration/regression/browser/live-model.cjs
# 正常重建 Alice Pod：保留旧/新 Pod UID、Cell/PVC UID、文件内容和会话证据。
node integration/regression/browser/lifecycle.cjs
node integration/regression/browser/negative.cjs
node integration/regression/browser/delete.cjs
# 停止平台，确认 Cell 不变；只读检查 SQLite 后，用相同固定配置重启。
node integration/regression/browser/restart.cjs
```

- `core`：OIDC 登录、分配原 key、Pending → Ready、两原生页面、跨 owner 拒绝、host-only cookie 元数据。
- `protocol`：原生 RPC、24 路并发、WS snapshot、HEAD/GET export、会话隔离。
- `lifecycle`：父会话登出和 SIGHUP 成员移除关闭已有 WS、拒绝后续 RPC，Bob 不受影响；最后恢复成员映射。
- `negative`：伪造身份头、跨 origin、缺少 Origin 的写请求均拒绝。
- `delete`：普通用户 DELETE 拒绝；错误 UID 不关闭活跃连接；精确管理员删除先撤权，重复 DELETE/POST 只查旧实例。关闭后的未知 origin 返回 421，不能硬编码只有 401 才表示拒绝。
- `restart`：重新登录后 Alice 仍绑定原 UID、会话仍在；Bob 的 delete-requested 屏障仍在。
- `expiry`：将 fixture 的 sessionLifetimeMs 临时设为 60000 并重启后运行 `browser/expiry.cjs`，验证真实计时关闭 WS；完成后恢复正常配置。这不是缩短产品默认 TTL。

额外集群验证：CRD 拒绝改写/移除 allocation；未授权 Pod 与错误 namespace 的同名标签都不能直连；foreign HTTPRoute 触发 AccessModeConflict 且原对象不被清理；删除后确认 Pod/私有 PVC 消失、Retain 数据 PVC 仍在。Kubernetes 接受 DELETE 的返回值不是 writer 已停止证明。

`fixtures/api-fault.cjs` 是可选的任务内 HTTPS API relay，只用于故障注入：挂载专用 TLS 证书/脚本，转发原调用身份，`/tmp/mode` 为 create/delete 时，等真实 API 完成相应写入再丢弃响应。仅通过原 key 查询；记录一条 POST/DELETE，不重发。relay 日志只包含方法、状态或错误码，完成后停止它。不能将 relay 部署在共享/生产入口。

每次报告区分真实集群、浏览器、本地 socket 与 mock。HA、分区 fencing、强制删除、历史升级/恢复、多后端与发行安装矩阵不属于此 gate。
