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
