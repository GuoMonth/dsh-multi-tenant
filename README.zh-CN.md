# dsh-multi-tenant

[English](README.md)

为每个 `(tenantId, principalId)` 运行独立的原生 DeepSeek Harness Host。平台负责认证、域数据、运行时生命周期和 HTTP/WebSocket 准入；DSH 负责域内会话、workspace、preset、工具及完整原生 Web。

**0.7.0 是破坏性架构变更。** 原共享进程 Cordis 插件、逐 Agent 资源接口和自定义面板已被替换。使用新的平台数据目录，不提供旧数据库迁移和兼容层。源码版本号不代表已经发布 npm。

## 授权契约

- 按 `(tenantId, principalId)` 隔离数据与执行环境；同租户不同 Principal、不同租户的同名 Principal 均隔离。
- 域内沿用 DSH 原生会话、workspace、preset 和权限控制，不承诺会话之间独立访问授权。工具过滤、停止、归档和删除保留原生语义，不能理解为根会话读取 ACL。
- 平台管理权限始终在用户域之外。域目录、认证秘密、Docker socket 和平台管理接口不得进入原生 Host；原生 settings 与 credentials 只属于当前域。
- 所有公开 TypeScript API 都供可信平台使用。不能把协调器挂到用户的原生 Web，不能从浏览器参数生成身份、镜像、profile 路径、后端地址或可信 origin。

## 安装与环境

```sh
npm install dsh-multi-tenant@0.7.0
```

PR 尚未发布时，先运行 `pnpm --filter dsh-multi-tenant pack`，安装产生的 `.tgz`。

平台使用 Node 22.19 或 Node 24+；内置 provider 面向 Linux。Docker provider 要求本机 Docker engine 及预构建的不可变镜像。镜像内固定 **DSH 0.1.5-rc.2**，源码身份 `fb2c4b9e698e30edb738bca4cf0618587db7d203`。协调器使用有 Docker 权限的非 root 用户运行；参考 runtime 的 UID/GID 必须与协调器相同，才能访问双方私有控制文件。平台进程不安装 DSH 运行时。TypeScript 消费者安装 `@types/node`，并在编译选项 `types` 中包含 `node`。

Docker 参考实现使用 `--network none`，适用于本地工具和无外部调用的模型；不能连接外部模型 API 或远程 MCP。需要出站网络的部署应实现经过审查、明确网络策略的 `RuntimeProvider`。本地进程 provider 仅用于可信开发，不是恶意工作负载的隔离边界。

## 嵌入认证服务

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

每域使用独立主机名并由可信反向代理终止 TLS；仅区分端口不能隔离浏览器 Cookie。代理保留经核对的外部 Host/Origin；入口忽略客户端转发身份头。所有原生 HTTP 和 WebSocket 路径统一准入，DSH 内层 Cookie 留在平台，不传给浏览器。这里没有平台管理 HTTP 路由。

关闭平台时都要尝试 `ingress.close()` 和 `runtime.close()`，保留失败以便修复后重试。可复用的嵌入示例见 `examples/native-domains/platform.mjs`。

## 镜像及原生 profile

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

`pnpm release:check` 验证 exports、声明、生命周期、入口、持久化和独立 tarball 消费者。运行 `pnpm --dir scripts/native-host-probe install --frozen-lockfile` 后执行 `pnpm probe:isolated`，通过安装后的包验证真实原生 Host 和 Playwright；先安装 Chromium 或设置 `PROBE_CHROMIUM`。探针构建固定测试镜像，只使用假凭据、无外部调用模型和本地 MCP，结束时清理运行时。

针对精确 rc.2 验证根/子代理组合、冷恢复、原始传输、浏览器重连、域凭据、撤销与容器恢复。历史根级 publication 反例保留为边界回归：同 Principal 的历史仍可读取，符合新契约。验证通过不等于通用安全认证，也不表示支持共享 Host 内的多用户授权。
