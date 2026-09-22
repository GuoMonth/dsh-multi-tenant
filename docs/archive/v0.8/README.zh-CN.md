# dsh-multi-tenant

[文档索引：按任务读取](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/README.md)

> **当前开发边界：** Cell MVP + 中立内部契约；固定验证版本，允许破坏性变更，不承诺历史兼容、升级或无感恢复。先走通核心链路，失败提供 AI 可解读诊断。见[项目宪法](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONSTITUTION.md)。下文已存在的 CLI/SDK 行为描述其版本，不代表新版本兼容承诺。

[English](README.md) · [版本发布](https://github.com/GuoMonth/dsh-multi-tenant/releases) · [更新记录](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CHANGELOG.md)

让每位登录用户拥有自己的原生 DeepSeek Harness 工作环境。用户继续使用 DSH 的聊天、workspace、文件、preset 和子代理，平台负责将不同用户的数据与执行环境隔离。

提供两种入口：用 CLI 在本机体验完整工作台，或用 SDK 将独立 DSH Host 接入现有登录系统。项目负责启动和管理 DSH；它不是安装进共享 DSH Host 的多用户插件。

## 一行体验

需要 Node 22.19.x 或更新的 22.x，或 Node 24+，以及正在运行的本机 Docker（Linux 容器）。无需手动安装 DSH、构建镜像或准备 API key。

```sh
npx -y dsh-multi-tenant@0.8.0 start
```

本文对应 0.8.0；运行前可用 `npm view dsh-multi-tenant@0.8.0 version` 确认发布状态。如果尚不可用，使用[源码验证流程](../../../docs/reference/quickstart.zh-CN.md)，旧版 0.7.1 没有 CLI。发布后也可用 `@latest` 获取当前稳定版。

浏览器中选择 Alice 或 Bob，进入各自的原生 DSH 工作台。默认确定性演示模型支持读取样例、生成文件和委派子代理；真实 AI 需要在原生 Settings 配置模型凭据。Ctrl-C 停止运行并保留数据。Linux amd64/arm64 已有原生验证记录；macOS/Windows Docker Desktop 暂为实验支持。

[完整启动、停止与排错说明](../../../docs/reference/quickstart.zh-CN.md)

## 让 AI 帮你使用或开发

将下面这段话交给你的 coding agent：

```text
请阅读 https://raw.githubusercontent.com/GuoMonth/dsh-multi-tenant/main/packages/multi-tenant/AI.md，
核对当前 npm 版本和本机环境，帮我启动并验证 dsh-multi-tenant。
如果要修改项目源码，先阅读仓库根目录 AGENTS.md，并说明你要运行哪些相关验证。
```

[AI 项目导航](packages/multi-tenant/AI.md)覆盖体验、SDK 集成、源码定位与排错；[AGENTS.md](../../../AGENTS.md)提供仓库开发约定。npm 包内也包含 `AI.md`，已安装的包应优先使用随包指引。

## 适合哪些场景

| 场景 | 能解决的问题 | 平台需要提供 |
| --- | --- | --- |
| 企业研发工作台 | 员工使用原生 DSH，分别持有自己的历史、文件和 MCP 配置 | 企业登录、TLS、私有存储和运行环境 |
| 多租户应用 | 不同租户的同名用户也得到独立环境，避免身份或数据混用 | 可信租户/用户身份、域名和资源策略 |
| 原生 DSH 集成与验证 | 复用官方 Web、preset 和子代理行为，减少额外聊天界面的维护 | 固定版本的原生运行时、受审查 profile 和 runtime provider |

典型使用流程是：**用户登录 → 平台确定所属域 → 启动或复用专属 DSH Host → 进入原生 Web**。断线重连仍回到同一个域，每次请求或每个会话都不需要新建 Host。

## 平台 SDK 提供什么

- 按 `(tenantId, principalId)` 持久化域归属和期望状态，平台重启后仍能核对身份与撤销状态。
- 去重启动、generation 校验、暂停/撤销、有时限的停止，以及协调器崩溃后的可验证恢复。
- 面向原生 Web 的认证 HTTP/WebSocket 入口，保留消息、工具和文件传输，DSH 内层登录凭据留在平台。
- 受限 Linux Docker 参考 provider、可信开发用本地进程 provider，以及部署方实现其他运行环境的公开接口。
- 使用原生 preset/MCP/子代理组合，通过安装后的真实运行时验证，替换旧逐 Agent facade。

## 使用前需要了解的边界

**本包面向开发者集成。** Docker 默认使用 bridge 网络，允许访问外部模型 API 和远程 MCP；需要离线运行时设置 `network: 'none'`。从 0.7.1 起，bridge 替代 0.7.0 的默认无网络配置。登录/SSO、TLS、域配置、配额和运维监控由接入平台负责，CLI 的本地演示身份不替代账号管理 UI 或托管服务。

授权边界是**租户内的用户**。同一 Principal 的两个 workspace 或会话不承诺互相保密；域内权限、工具过滤、停止、归档、删除和 preset 选择沿用原生语义。本版本不提供团队共享域、项目 ACL、跨用户会话共享、自动空闲回收或跨机调度。

独立 Host 有固定的内存和启动成本，浏览器断开后也可能仍有后台任务。资源限制和域回收时机应根据实际工作负载决定。平台管理权限、登录秘密和 Docker socket 必须始终位于用户域之外。

**从 0.7.1 升级到 0.8.0：** 既有 SDK API 保持不变；新增 CLI 使用独立状态目录与固定镜像的 Docker 命名卷，不自动导入平台数据。

**从 0.7.0 升级：** 域数据和平台接入 API 沿用现有结构。默认网络行为发生变化：需要保留离线限制时，在升级前显式设置 `network: 'none'`。使用新 Dockerfile 时重新构建镜像，停止旧 Host 后更新镜像 ID 并重新启动。

**从 0.5.x 或更早版本升级：** 0.7.0 改变了集成架构和公开 API，删除共享进程 Cordis 插件、逐 Agent 接口和自定义面板。需要新建平台目录、替换接入代码并单独保留旧数据，不提供旧数据库自动迁移。0.6.0 曾是源码里程碑，没有发布到 npm。

## SDK 接入入口

```sh
npm install dsh-multi-tenant@0.8.0
# 无需 Docker 或外部模型，先检查已安装的平台 API：
node node_modules/dsh-multi-tenant/examples/native-domains/smoke.mjs
```

这个 smoke 使用**模拟 runtime**，不会启动原生 DSH。要给用户提供真实工作台：

1. 按下文准备固定版本的原生镜像，以及每域 profile。
2. 接入登录/IdP，从可信认证结果取得租户和用户身份，为每域分配独立主机名。
3. 构建随包提供的运行时镜像，默认 bridge 网络支持模型/MCP 出站；需要离线运行时显式选择 `network: 'none'`。
4. 嵌入入口与协调器，配置私有数据，并在平台实现关闭、暂停和恢复流程。

想先体验完整的无外部调用原生 Web 验证，可从源码安装项目和 `scripts/native-host-probe` 依赖，在具备 Docker、Chromium 的环境运行 `pnpm probe:isolated`，见[可复现原生验证](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/scripts/native-host-probe/README.md)。该环境用于验证，不提供公网登录服务。

## 授权契约

- 按 `(tenantId, principalId)` 隔离数据与执行环境；同租户不同 Principal、不同租户的同名 Principal 均隔离。
- 域内沿用 DSH 原生会话、workspace、preset 和权限控制，不承诺会话之间独立访问授权。工具过滤、停止、归档和删除保留原生语义，不能理解为根会话读取 ACL。
- 平台管理权限始终在用户域之外。域目录、认证秘密、Docker socket 和平台管理接口不得进入原生 Host；原生 settings 与 credentials 只属于当前域。
- 所有公开 TypeScript API 都供可信平台使用。不能把协调器挂到用户的原生 Web，不能从浏览器参数生成身份、镜像、profile 路径、后端地址或可信 origin。

## SDK 安装与环境

```sh
npm install dsh-multi-tenant@0.8.0
```

验证尚未发布的源码时，运行 `pnpm --filter dsh-multi-tenant pack` 并安装生成的 `.tgz`。

平台使用 Node 22.19 或 Node 24+；内置 provider 面向 Linux。Docker provider 要求本机 Docker engine 及预构建的不可变镜像。镜像内固定 **DSH 0.1.5-rc.2**，源码身份 `fb2c4b9e698e30edb738bca4cf0618587db7d203`。协调器使用有 Docker 权限的非 root 用户运行；参考 runtime 的 UID/GID 必须与协调器相同，才能访问双方私有控制文件。平台进程不安装 DSH 运行时。TypeScript 消费者安装 `@types/node`，并在编译选项 `types` 中包含 `node`。

Docker 默认使用 `--network bridge`；设置 `network: 'none'` 即使用 `--network none`。不发布端口，原生服务只监听容器内 loopback。bridge 可访问网络可达的宿主机、内网服务及同桥容器，不提供网络级租户隔离；需要限制时由部署方配置防火墙。外部模型和 MCP 仍需相应凭据。本地进程 provider 仅用于可信开发，不是恶意工作负载的隔离边界。

## 嵌入认证服务

下面是集成片段，`authenticator` 和 `trustedDomainOrigins` 由平台提供。

```js
import {
  SQLiteDomainRepository, DomainRuntimeCoordinator,
  DockerRuntimeProvider, createDomainIngress, DSH_RUNTIME_VERSION,
} from 'dsh-multi-tenant'

const directory = new SQLiteDomainRepository('/srv/dsh/control')
const runtime = new DomainRuntimeCoordinator(directory,
  new DockerRuntimeProvider({
    directory: '/srv/dsh/runtime',
    image: 'sha256:<immutable-image-id>',
    profileDirectory: domainId => `/srv/dsh/profiles/${domainId}`,
    uid: process.getuid(), gid: process.getgid(),
  }), DSH_RUNTIME_VERSION, 45_000, 20_000)

const ingress = createDomainIngress({
  authenticator, // 平台实现 DomainAuthenticator，接入自己的登录或 IdP
  runtime,
  originFor: owner => trustedDomainOrigins.get(JSON.stringify([owner.tenantId, owner.principalId])),
})
ingress.server.listen(8080, '127.0.0.1')
```

启动前先配置域的 profile；可信平台可通过 `directory.resolve(owner)` 获取不透明域 ID。`authenticator.authenticate(request, signal)` 必须在真实认证后返回 `{ owner, signal }`；登出或过期时中止返回的 signal，关闭已有流。`MemoryDomainSessions` 仅是内存参考适配器，`issue(owner)` 是可信服务端操作，不能直接做成无需认证的登录接口。登录 token 应由平台写入 Secure、HttpOnly、host-only、Path=/ 且有适当 SameSite 策略的 Cookie；适配器不生成 Cookie 响应，也不实现 IdP。

每域使用独立主机名并由可信反向代理终止 TLS；仅区分端口不能隔离浏览器 Cookie。代理保留经核对的外部 Host/Origin；入口忽略客户端转发身份头。入口保留原生 CSP，并额外限制只能同源 iframe 嵌入，拒绝跨域页面嵌入。所有原生 HTTP 和 WebSocket 路径统一准入，DSH 内层 Cookie 留在平台，不传给浏览器。这里没有平台管理 HTTP 路由。

关闭平台时都要尝试 `ingress.close()` 和 `runtime.close()`，保留失败以便修复后重试。可复用的嵌入示例见 `examples/native-domains/platform.mjs`。

## 镜像及原生 profile

### 构建内置运行时镜像

源码目录执行（npm 安装后将路径替换为 `node_modules/dsh-multi-tenant`）：

```sh
docker build -f packages/multi-tenant/runtime/Dockerfile -t dsh-domain-runtime:local packages/multi-tenant
docker image inspect dsh-domain-runtime:local --format '{{.Id}}'
```

将输出的 `sha256:...` 传给 provider 的 `image`，并按下文准备每域 profile。Dockerfile 和依赖锁随 npm 包发布，包含明确标识的 CLI 演示模型与 MCP，不包含真实凭据；SDK 的 profile 不会自动启用这些演示功能。基础镜像固定 digest，DSH 及 npm 依赖由 lockfile 固定；系统工具使用 Debian 仓库的当前安全更新，因此构建结果以最终镜像 ID 为准。

内置 Bash、Git/SSH 客户端、curl/wget、jq、ripgrep、常用文本/归档工具、Python 3/venv/pip、C/C++ 编译工具，以及基础镜像提供的 Node/npm。不预装需要账号的 AI CLI、浏览器或所有语言 SDK；可通过派生镜像按项目补充。运行时根目录只读，新增 Python 依赖可放在 `/domain/.venv`，Node 项目依赖放在 `/domain` 的项目目录。`/tmp` 为 noexec，编译或安装工具需要执行临时文件时，将 `TMPDIR` 指向 `/domain` 内可写目录。Provider 会覆盖镜像默认用户，使用平台配置的非 root UID/GID。

```js
new DockerRuntimeProvider({
  // ...image、directory、profileDirectory、uid、gid
  network: 'none', // 可选：禁止出站；省略时使用 bridge
})
```



Docker provider 启动 `/opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --patch /profile/runtime.patch.json`，监听容器内 loopback 3081，不打开浏览器；固定版本 Loader 使用 Node `--expose-internals`。安装精确原生运行时后，将包导出的 `dsh-multi-tenant/native/runtime-control.mjs` 复制到镜像的 `/opt/dsh/runtime-control.mjs`。通过原生 patch 插入：

```json
[
  { "id": "web-runtime", "config": { "printUrl": false, "openBrowser": false } },
  { "insert": [{
      "id": "domain-runtime-control",
      "name": "/opt/dsh/runtime-control.mjs",
      "config": { "runtimeManifest": "/opt/dsh/node_modules/@deepseek-ai/dsh/package.json" }
  }] }
]
```

该资产使用公开 `appReady` 和 `connection.authenticatedUrl`，不修改私有 scope，不替换业务 controller。它属于原生 Host，不要装入平台进程。

域数据挂载在 `/domain`，可信 profile 只读挂载在 `/profile`，有限的就绪/传输目录在 `/control`。根文件系统只读，非 root UID/GID，丢弃 capabilities，启用 no-new-privileges。默认限制为 1 GiB 内存、1 CPU、160 PIDs、128 MiB 临时目录；这些是可配置的参考限制，不是生产容量承诺。现有平台目录须由平台私有持有，不能让其他宿主用户修改。

原始 socket 路径必须不超过 Linux 的 107 字节限制。平台固定 socket inode 后通过文件描述符连接，域内替换符号链接不能把连接转向平台或其他域。就绪读取拒绝符号链接与非常规文件，限制在 16 KiB 内。

域内原生设置、插件和凭据可能影响该 Principal 的全部会话。平台秘密不得放入其环境、profile、credentials 或挂载。镜像和网络策略变更必须重新验证；复用完整原生 UI 不代表授予平台管理权限。

## 停止、撤销、轮换与恢复

- `runtime.stop(id)` 使当前连接失效并关闭 Host；域仍 enabled，下次准入可启动新 generation。
- `runtime.setDesired(id, 'suspended')` 先持久化暂停再停止；显式恢复 enabled 前拒绝准入。
- `runtime.setDesired(id, 'revoked')` 是不可逆的域访问撤销，重启后仍拒绝。不会自动删除留存数据，也不会撤销外部服务凭据；数据清理须在确认停止后由平台显式执行。
- 域级能力或凭据轮换：暂停域，等待清理完成，替换可信资产或撤销外部凭据，再启用。外部撤销失败则保持暂停。域内原生 credentials 编辑仍遵循原生行为，不承诺 MCP 热轮换。
- 停止失败保留所有权并阻止新 writer；修复后重试，不能手工清除锁或 `unresolved`。
- 协调器崩溃后，对残留记录执行 `runtime.recover(id)`。Docker provider 核对 domain/generation/owner 标签，移除精确旧容器后才允许复用存储；拒绝接管外来所有权。本地进程 provider 不提供自动恢复证明。

每个本地 SQLite 目录只有一个协调器，不提供跨机调度或存储 fencing。浏览器断线可能仍有后台任务，因此没有自动空闲回收；域持续运行直到显式停止。配额和调度由嵌入平台基于实际工作负载决定。

## 验证与范围

`pnpm probe:image` 从安装后的 npm 产物构建用户镜像，验证真实 DSH 就绪、工具可用、默认 HTTPS 出站以及显式 none 阻断。不调用模型 API。

`pnpm release:check` 验证 exports、声明、生命周期、入口、持久化和独立 tarball 消费者。运行 `pnpm --dir scripts/native-host-probe install --frozen-lockfile` 后执行 `pnpm probe:isolated`，通过安装后的包验证真实原生 Host 和 Playwright；先安装 Chromium 或设置 `PROBE_CHROMIUM`。探针构建固定测试镜像，只使用假凭据、无外部调用模型和本地 MCP，结束时清理运行时。

针对精确 rc.2 验证根/子代理组合、冷恢复、原始传输、浏览器重连、域凭据、撤销与容器恢复。历史根级 publication 反例保留为边界回归：同 Principal 的历史仍可读取，符合新契约。验证通过不等于通用安全认证，也不表示支持共享 Host 内的多用户授权。
