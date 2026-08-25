[English](./README.md) | 简体中文

# dsh-multi-tenant

**让 DeepSeek Harness 真正变成一个可以承载 SaaS 产品的 Multi-Tenant Agent Runtime。**

当一个 DSH Runtime 要安全服务多个组织和用户时，最先变危险的通常不是模型，而是：**请求属于哪个 Tenant / Principal、能使用哪份 credential 与 MCP config、能不能恢复某个 Session，以及长生命周期 Agent 最终归谁管理。**

> 当前 Release Candidate：**`dsh-multi-tenant@0.3.0-rc.3` — Durable Local Experience**
>
> Compatible DSH baseline：`0.1.1-rc.2` / `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。

## SaaS 化真正麻烦的地方

```text
Acme / Alice   -> Acme ERP MCP + Alice credential + Alice Sessions
Acme / Bob     -> Acme ERP MCP + Bob credential   + Bob Sessions
Globex / Alice -> Globex ERP MCP + Globex/Alice credential + Globex Sessions
```

`dsh-multi-tenant` 把这些重复胶水收敛成一条产品链路：

```text
产品已经认证过的 subject
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal credentials
  -> fail-closed Session ownership
  -> Principal-aware Agent create/resume
  -> native DSH Agent + MCP Tools
```

Product authentication 继续归产品自己。JWT、Cookie、OIDC、server session 等登录机制先完成验证，再把可信 subject 交给 Runtime。

## 先看到价值，再接产品

直接安装到真实 DSH Web profile，并显式打开 starter：

```sh
dsh plugin --profile web add dsh-multi-tenant
DSH_MULTI_TENANT_STARTER=1 dsh web
```

然后打开 DSH 输出的 URL，再访问 `/_dsh-multi-tenant`。

starter 默认休眠，可以切换：

```text
Acme / Alice
Acme / Bob
Globex / Alice
```

并通过真实 DSH Agent + 官方 MCP client + 真实 stdio MCP Tool 直接证明：

- canonical Tenant / Principal；
- 真实 `tools/list` + `tools/call`；
- Principal credential 到达 MCP，但 raw credential 不返回；
- owner Session resume；
- cross-Principal Session denial；
- 第二 Tenant isolation。

这个 panel 挂在现有 DSH Web **旁边**，使用同一个 `ctx.webServer`；不是第二套聊天前端，也不是第二个 HTTP server。

## 安装

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

或者在已经拥有 compatible DSH installation 的 framework code 中：

```sh
pnpm add dsh-multi-tenant
```

MCP 路径复用 DSH 自带的官方 `@deepseek-ai/dsh-mcp-client`，不 vendor / fork MCP。

## 默认就是可重启的本地持久化

正常通过 DSH plugin 安装后，Session ownership 默认使用 Node 内置 `node:sqlite` 的 SQLite provider。个人开发者第一次验证不需要先装 PostgreSQL、Docker，也不需要额外 native addon 或数据库 npm dependency。

```text
Alice claim Session s1
        ↓
<cwd>/.dsh-multi-tenant/session-ownership.sqlite
        ↓ 重启 DSH / Node
Alice -> s1          允许
Bob   -> s1          拒绝
Globex/Alice -> s1   拒绝
```

需要时可以覆盖数据库位置：

```sh
DSH_MULTI_TENANT_SQLITE_PATH=/path/to/session-ownership.sqlite dsh web
```

Framework code 也可以直接挂载同一个 provider：

```ts
import SQLiteTenantSessionStore from 'dsh-multi-tenant/sqlite-store'

await ctx.plugin(SQLiteTenantSessionStore, {
  path: './state/session-ownership.sqlite',
})
```

SQLite 的定位是 **local durable / single-node adoption provider**。`InMemoryTenantSessionStore` 继续用于 hermetic test。未来 PostgreSQL 或其他 multi-instance provider 应继续实现同一个 `TenantSessionStore` contract，而不是改变 Core ownership 语义。

## 最短产品链路

```ts
import { createMcpSaaSRuntime } from 'dsh-multi-tenant'

const app = await createMcpSaaSRuntime(ctx, {
  identity(subject: TrustedSubject) {
    return {
      tenantId: subject.organizationId,
      userId: subject.userId,
    }
  },
  mcp: {
    load({ tenantId }) {
      return {
        servers: [{
          transport: 'streamable-http',
          serverName: 'erp',
          url: endpointForTenant(tenantId),
          credentialHeaders: {
            Authorization: { credential: 'erpToken', prefix: 'Bearer ' },
          },
        }],
      }
    },
  },
  credentials: {
    create({ principal }) {
      return loadCredentialsFor(principal)
    },
  },
})

const principal = await app.resolve(trustedSubject)
const handle = await principal.create({ sessionId })
```

`createMcpSaaSRuntime()` 只是现有 `CompositionPlan -> RuntimeComposition -> ProductIngress -> createMcpAgentIntegration()` 之上的薄 MCP-specific facade，不创建第二套 Runtime / DI system。高级使用者仍然可以直接使用 Core primitives。

### 已有 JWT / Cookie / req.user 怎么接

```ts
import {
  mountMcpSaaSWebBridge,
  readBearerToken,
  readCookie,
} from 'dsh-multi-tenant'

mountMcpSaaSWebBridge(ctx, app, {
  async authenticate(req) {
    const jwt = readBearerToken(req.headers)
    if (jwt) return verifyExistingJwt(jwt)

    const sessionId = readCookie(req.headers, 'product_session')
    if (sessionId) return lookupExistingServerSession(sessionId)

    return undefined
  },
})
```

这些 helper 只提取 transport value；authentication / verification 继续归产品自己。

## 0.3 给你的能力

- trusted product subject -> canonical Tenant / Principal；
- exact `CompositionPlan -> RuntimeComposition` binding；
- Principal-scoped replaceable credentials；
- Tenant-scoped MCP configuration；
- Principal-bound Agent `create()` / `resume()`；
- immutable、fail-closed Session ownership；
- zero-external-service SQLite ownership persistence，重启后 owner 仍然保留；
- deterministic per-Session MCP namespace；
- Principal-owned long-lived Agent；
- 官方 DSH MCP Tools integration；
- MCP-specific product facade + same-server Web identity/admission bridge；
- secret-safe structured diagnostics；
- opt-in real-DSH-Web starter；
- permanent First Product Experience + durable-local executable evidence；
- installed-artifact / registry verification。

## 技术架构

```text
Product authentication
        ↓ trusted subject
Product Web bridge / Product Ingress
        ↓
RuntimeComposition
        ↓
canonical Tenant / Principal
        ↓
Tenant MCP config + Principal credentials
        ↓
one-shot create/resume Operation
        ↓
Principal-owned DSH Agent
        ↓
官方 @deepseek-ai/dsh-mcp-client
        ↓
native Agent-scoped MCP Tools
```

职责边界保持很小：Product 管 authentication；Core 管 identity / composition / lifecycle；Integration 管 downstream protocol/configuration；Principal 拥有 long-lived Agent；DSH 管 MCP wire behavior。

## 明确边界

Pinned DSH Web 目前不会给每个 stock Web RPC business method materialize product-authenticated Principal Context。rc.3 严格保证的是 product-aware identity + Agent create/resume admission + Session ownership，不宣称“所有 stock DSH Web RPC 自动 tenant-authorized”。这是 [#41](https://github.com/GuoMonth/dsh-multi-tenant/issues/41) 已经明确承认的边界。

在 DSH upstream 还没有 request-scoped Principal seam 时，生产 Web 暴露推荐把 DSH Web 当成 **private backend**：

```text
Browser / external client
        ↓
Product Gateway / BFF
  - authentication
  - Tenant / Principal resolution
  - Session / Agent resource authorization
        ↓ private network / loopback
DSH Web + dsh-multi-tenant
```

公网客户端不能绕过 Gateway 直接访问 stock DSH `/api`。这是当前推荐的 production authority boundary，不是把 Web 授权问题藏进 SQLite。

SQLite 也不宣称具备 horizontally-scaled multi-instance production durability；它刻意服务个人开发者和 single-node validation。Cordis Context 也不是 hostile-code sandbox，真正的 process/filesystem/network 强隔离属于 process/container/Pod/sidecar/remote boundary。

## Evidence 与 Release

`pnpm release:check` 会同时 gate 真实 DSH Web First Product Experience 和 durable-local SQLite proof，并继续执行 typecheck/tests/build、packed artifact smoke，以及现有 DSH/Cordis/MCP probes。

`pnpm probe:sqlite` 会启动多个独立 Node process，共享同一个 SQLite 文件，证明 restart persistence、sibling-Principal denial、cross-Tenant denial，以及竞争 claim 只有一个 winner。

详见：

- [Direction](./DIRECTION.zh-CN.md)
- [Architecture](./docs/specs/architecture.zh-CN.md)
- [Product Ingress + Credentials](./docs/specs/product-ingress-credentials.zh-CN.md)
- [MCP Agent Integration](./docs/specs/mcp-agent-integration.zh-CN.md)
- [Compatibility](./docs/reference/compatibility.zh-CN.md)
- [Release contract](./docs/reference/release.zh-CN.md)
- [0.3.0-rc.3 release note](./docs/releases/v0.3.0-rc.3.md)

## License

MIT