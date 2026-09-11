# 原生双 Principal Host 技术探针

这是独立的架构实验，验证 DSH `0.1.5-rc.2` 原生 Web、AgentPresets、MCP、子代理和持久化在两个受限容器中的行为。它不加载本项目现有 multi-tenant 插件，不是生产入口或进程管理器。

## 运行

需要 Linux、可用的本机 Docker Engine、Node 24、pnpm 11.7.0 和 Chromium。执行者需要能从宿主访问 Docker internal bridge；Docker Desktop、远程 Docker、rootless Docker 和其他 OS 未验证。原生依赖安装需要相应构建环境。

在本目录安装独立依赖，避免并入仓库主工作区：

```sh
cd scripts/native-host-probe
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
docker pull node:24-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
node run.mjs
```

默认使用 Playwright 对应的 Chromium。可以用 `DSH_PROBE_CHROMIUM=/absolute/path/to/chromium` 指定现有浏览器。本次实测使用 Chromium 151.0.7922.34，宿主 Node 24.18.0、容器 Node 24.19.0；详见结果中的 `environment`。

也支持把本目录的 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` 复制到独立绝对路径，安装后作为第一个参数传入。第二个参数是证据目录：

```sh
node scripts/native-host-probe/run.mjs /absolute/path/to/installed-runtime /absolute/path/to/evidence
```

不传参数时，依赖取自本目录，证据写入 `docs/evidence/native-domain-review/multiprocess/`。成功退出码为 0，断言或清理失败为非零。不要向测试配置加入真实凭据。

## 文件职责

| 文件 | 用途 |
| --- | --- |
| `run.mjs` | 启动/移除两个临时域；真实 Remote、WebSocket、Fetch、浏览器和故障检查；输出结果 |
| `launch.mjs` | 用受支持的 CLI 启动官方 Web profile；字节转发到原生 loopback 监听 |
| `profile.patch.yml` | 通过官方 patch 装配测试模型、本域 preset root 和 query 路径 |
| `agent.cordis.yml` | 本域 MCP 与两种原生 subagent 工具；受限变体使用 inherited toolFilter |
| `model.mjs` | 无密钥的确定性 LlmAdapter；用真实工具调用协议驱动原生执行链 |
| `mcp.mjs` | SDK stdio MCP；读取本域的合成标记文件 |
| `pnpm-workspace.yaml` / lock | 独立安装、native build 允许列表，以及 DSH rc.2 传递依赖锁定 |

仅模型输出是确定性测试适配器。AgentPresets、Agent loop、scope、MCP 客户端、工具执行、子代理、Session、JSONL、SQLite query、Remote、认证和 Web 均使用原生发布包，没有复制上游控制器或修改上游源码。

## 边界与清理

每个域拥有自己的 `/domain`、`DSH_HOME`、工作目录和 internal Docker network。程序与 fixture 只读共享；容器使用非 root UID、只读根文件系统、独立 tmpfs、1 CPU / 1 GiB / 128 PID 限额，去掉 capabilities，启用 no-new-privileges，不挂载 Docker socket。网络禁用外网，测试不调用真实模型。

原生 DSH 仍监听容器内 `127.0.0.1:3081`。容器内字节 relay 和宿主 loopback relay 让本地浏览器访问它，保留原生 token exchange、Cookie、Host/Origin 和协议处理。这些 relay **没有实现平台身份认证、授权路由或连接撤销**。

测试使用两个预分配 Host 和两个浏览器上下文。因此它证明“路由已正确分配之后，原生域内功能可复用且数据隔离”，不能证明真实登录入口已安全。同机不同端口不是 Cookie 的隔离边界；生产域名、账号切换、TLS 和 ingress 仍需专门验证。

普通成功和失败路径都尝试关闭浏览器、连接、容器、网络并删除私有临时数据；清理失败写入 `results.json` 并使运行失败。外部强杀 runner 不会执行 JavaScript `finally`，可先只读查找残留：

```sh
docker ps -a --filter label=dsh-native-probe
docker network ls --filter label=dsh-native-probe
```

只清理确认属于本次运行的 `dsh-native-probe-<id>-*` 资源；不要按宽泛名称批量删除共享 Docker 资源。完整限制、资源测量及工程结论见 [技术验证报告](../../docs/evidence/native-domain-review/multiprocess/REPORT.zh-CN.md)。

## 后续重构实验

以上 `run.mjs` 保留 #74 的实验入口；`composition.mjs` 是 WP1 的孙级/fork/preset 切换补充实验，由根目录 `pnpm probe:native-host` 调用。两者共享固定依赖和原生测试适配器。

## WP1 composition fixture

This WP1 fixture boots two **real DSH 0.1.5-rc.2 Web profiles**, including the
official client, AgentPresets, AgentLoop, JSONL, MCP and subagent runtimes.
Only the model and the MCP test identity data are fixtures. It does not mount
the old multi-tenant service, change scope bindings, or replace native controllers.

## Run

Requires Linux, Docker, Node 24 and pnpm 11.7.0. From the repository root:

```sh
pnpm --dir scripts/native-host-probe install --frozen-lockfile
PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm --dir scripts/native-host-probe exec playwright install chromium
pnpm probe:native-host
```

An existing Chrome executable can be used explicitly instead of downloading a
browser: `PROBE_CHROMIUM=/usr/bin/google-chrome pnpm probe:native-host`.
The report records the browser and container Node versions. The base image is
digest-pinned; the full native runtime uses its own frozen lockfile, independently
of the smaller plugin dependency graph. Installation/build requires registry
access; model calls require no keys or external services.

Each run creates uniquely named test containers, volumes, an internal Docker
network and an image. Docker-internal networking has no ordinary external egress;
a host-side loopback byte relay provides browser access. The native DSH listener
stays on container loopback. This relay is a **test carrier**, not an authenticated
production gateway. Both test containers share the internal network; this is not
a proof of per-domain network isolation.

The runner obtains the native browser cookie through the official CLI launch URL,
keeps credentials in memory, redacts launch tokens from failure logs and removes
its Docker resources on normal completion or a caught failure. Cleanup errors
fail the run. Evidence is retained in the printed `/tmp/dsh-wp1-*/` directory.
An externally killed runner may require removal of its exact, uniquely named
resources; do not use Docker prune or remove other runs' resources.

## Covered behavior

- Same Session ID, preset and MCP name in separate domains resolve different private markers.
- Native child/grandchild delegation, one-shot fork and blank-session preset switching.
- Restricted child schemas omit MCP, and a model deliberately forcing the tool receives rejection.
- Real Host stop/start, cold child history, continuation and retained child restrictions.
- Native file reads, cross-host cookie rejection and raw upload.
- Official browser UI displays its domain's sessions, sends messages, reconnects its mux,
  sends again and opens settings in independent browser contexts.

The proof does **not** implement the production login gateway, all-route admission,
root/Principal revocation, arbitrary per-root grants, production FS/network policy,
capacity management or fault-injected supervisor lifecycle. It does not close
#68, #71 or #65. The minimal probe preset proves composition with real AgentPresets;
it is not a qualification of every shipped preset or arbitrary third-party plugin.

## 中文说明

WP2 的新协调器与真实原生 CLI 联调可独立运行：`pnpm probe:runtime`。
该命令使用此处的冻结依赖，无需 Docker 或浏览器；结果和限制见
[WP2 证据](../../docs/evidence/native-domain-review/wp2/README.md)。

这是重构 WP1 的真实原生链路实验。它使用官方完整 Web 和原生 preset/Agent/子代理，
不会通过重绑 scope、复制工具或替换控制器获得通过结果。

执行上述命令即可复现；也可以显式指定已有 Chrome。实验使用两个独立数据卷，
相同 Session ID、preset 和 MCP 名称故意制造标识冲突，以验证实际域归属。
成功报告、两个浏览器截图和页面文字保留在打印的临时证据目录；登录 token 不写入报告。

报告只证明列出的功能路径。测试 loopback relay 不是生产认证代理；两个容器仍共享内部网络。
域生命周期、完整入口授权、根/Principal 撤销、真正的执行隔离和容量验收由 WP2–WP4 完成。
本实验不表示三个 Issue 已解决，也不宣称支持一个共享 Host 内的多 Principal 授权。

## Authenticated isolated runtime experiment

`pnpm probe:isolated` exercises the new ingress and Docker provider with the real native Web. Build its image first with `docker build -f scripts/native-host-probe/Dockerfile.runtime -t dsh-runtime-wp4-probe .` from the repository root. See the [WP3/WP4 report](../../docs/evidence/native-domain-review/wp34/README.md) for requirements, successful checks, and the root-authorization counterexample that still blocks WP5. This image is an offline test fixture, not a production release.
