# 本机开发者体验

本文对应 0.8.0。先用 `npm view dsh-multi-tenant@0.8.0 version` 核对是否可用；尚不可用时走下方源码验证流程。0.7.1 不包含 CLI，正式产物内置经过验证的镜像 digest。

## npm 入口

先准备 Node 22.19 或更新的 22.x，或 Node 24+、正在运行的本机 Docker（Linux containers）。不需要 pnpm、DSH、仓库源码、模型密钥或 Docker registry 登录。

```sh
npx -y dsh-multi-tenant@0.8.0 start
```

或全局安装后运行：

```sh
npm install -g dsh-multi-tenant@0.8.0
dsh-multi-tenant start
```

CLI 检查 Docker，自动拉取该版本固定的镜像，创建私有状态，打开浏览器。默认 loopback 端口 3080，冲突时自动分配空闲端口。首页选择 Alice/Bob，首次进入启动其独立原生 DSH Host。两位用户使用不同 localhost 主机名，无需修改 hosts。

默认演示模型是确定性适配器，明确标识，不提供真实智能回答。试试“读取样例”“生成文件”“委派子代理”，它们通过原生 MCP、文件和子代理链路执行。要使用真实模型，在原生 Settings 配置对应凭据，在会话中选择真实 provider/model。演示身份之间不共享凭据。

首次下载时间取决于镜像与网络，后续复用缓存；没有可用 Docker 时给出修复动作，不自动安装 Docker，也不退回未隔离的本机进程。

## 操作

```sh
dsh-multi-tenant status
dsh-multi-tenant stop
dsh-multi-tenant doctor
dsh-multi-tenant start --no-open --port 3080 --data-dir /absolute/private/path
```

自定义 data-dir 后，其他命令须指定同一目录。默认平台状态在用户 home 的 `.dsh-experience`；DSH 数据在 Docker 命名卷中，与 npx 缓存分开。Ctrl-C/stop 停止容器但不删除卷。再次启动保留历史、文件和域设置。并发 start 复用已运行入口；SQLite 继续拒绝第二个 coordinator。

启动 URL 包含短期一次性片段。它授权当前本机体验入口，不要分享；交换后会从地址栏移除。链接过期时重新 start 即可。无图形桌面时复制打印地址到本机浏览器。本入口只绑定 127.0.0.1，不是公网登录/SSO，不自动建 tunnel。

实例固定 image/DSH/profile 版本。新 CLI 遇到不兼容数据不会自动迁移；使用原版本继续，或用新 data-dir 评估。删除数据必须先停止并准确核对该实例的 Docker volumes；本版不提供容易误删数据的一键 reset。

## 平台支持

- Linux amd64/arm64 + 本机 Docker Engine：已通过原生 runner 上的安装后 CLI CI；镜像发布时重复验证。
- macOS / Windows Docker Desktop：新的 provider 不再依赖宿主 bind path、UID 或 Unix Socket；实机认证与浏览器验证未完成前视为实验支持。
- 远程 Docker、Windows containers：明确拒绝。仅安装 Docker Desktop 不代表 daemon 已启动。

共享 bridge 的网络策略沿用 Docker；它不是网络级租户隔离。用户容器无 Docker socket 或平台目录挂载；仅受认证转发端口绑定 loopback。宿主用户本身能够控制 Docker，不属于隔离的恶意对手。

## 源码评审

正式发布前可用本地构建的镜像验证。以下是维护者流程，不是未来首页使用路径：

```sh
pnpm install --frozen-lockfile
pnpm build
docker build -f packages/multi-tenant/runtime/Dockerfile -t dsh-experience:dev packages/multi-tenant
docker image inspect dsh-experience:dev --format '{{.Id}}'
node packages/multi-tenant/dist/cli.mjs start --image sha256:<输出的ID> --data-dir /tmp/dsh-experience-dev
```

`--image` 只接受固定 digest/本地 image ID。源码 manifest 的 image 为 null，避免发布前假装镜像已经存在。正式发布工作流先发布并匿名验证固定镜像，再将 digest 注入 npm 产物。

通过 npx 启动且未全局安装时，管理命令也用 `npx -y dsh-multi-tenant@0.8.0 status`（或 `stop`/`doctor`）。需要 AI 协助时参阅 [AI 项目导航](../../packages/multi-tenant/AI.md)。
