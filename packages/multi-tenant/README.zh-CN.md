# dsh-multi-tenant

**让 DeepSeek Harness 可以安全地跑在真正的 Multi-Tenant SaaS 产品后面。**

当一个 DSH Runtime 要同时服务多个组织和多个用户，而且 Tenant config、Principal credential、Session ownership、Agent-scoped MCP Tools 不能串时，就用这个 package。

> **`dsh-multi-tenant@0.3.0-rc.3` — Durable Local Experience**
>
> Compatible DSH baseline：`0.1.1-rc.2`。

## 它解决的问题

单用户 Agent 很简单：

```text
request -> Agent -> MCP -> backend
```

SaaS Runtime 真正要保证的是：

```text
Acme / Alice   -> Acme MCP + Alice credential + Alice Sessions
Acme / Bob     -> Acme MCP + Bob credential   + Bob Sessions
Globex / Alice -> Globex MCP + Globex/Alice credential + Globex Sessions
```

`dsh-multi-tenant` 把重复的 Tenant lookup、credential plumbing、MCP setup、Session authorization、Agent lifecycle 收敛成一条产品链路：

```text
产品已经认证过的 subject
  -> Tenant / Principal
  -> Tenant MCP config
  -> Principal credentials
  -> fail-closed Session ownership
  -> Principal-aware Agent create/resume
  -> native DSH MCP Tools
```

Authentication 继续归产品自己。框架从 JWT、Cookie、OIDC session、API key 等登录机制已经产生可信用户/subject 之后开始工作。

## 安装

Compatible DSH profile：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

如果 framework code 本身已经拥有 compatible DSH installation：

```sh
pnpm add dsh-multi-tenant
```

MCP 路径复用 DSH 自带的官方 `@deepseek-ai/dsh-mcp-client`，本项目不 vendor / fork MCP。

## Durable Local Session Ownership

正常 DSH plugin 安装现在默认使用 SQLite provider。它基于 Node 内置 `node:sqlite`，所以个人开发者第一次做持久化验证，不需要先安装 PostgreSQL、Docker、native addon 或额外数据库 dependency。

```text
Alice claim Session s1
        ↓
<cwd>/.dsh-multi-tenant/session-ownership.sqlite
        ↓ 重启 DSH / Node
Alice -> s1          允许
Bob   -> s1          拒绝
Globex/Alice -> s1   拒绝
```

可以用 `DSH_MULTI_TENANT_SQLITE_PATH` 覆盖默认路径，也可以在 framework code 中直接挂载：

```ts
import SQLiteTenantSessionStore from 'dsh-multi-tenant/sqlite-store'

await ctx.plugin(SQLiteTenantSessionStore, {
  path: './state/session-ownership.sqlite',
})
```

SQLite 的定位是 **local durable / single-node adoption provider**，不是 horizontally-scaled production database。`InMemoryTenantSessionStore` 继续用于 hermetic test；未来 PostgreSQL/其他 provider 继续实现同一个 `TenantSessionStore` contract 即可。

## First Product Experience

接自己的产品之前，可以先在真实 DSH Web profile 上显式打开 starter：

```sh
dsh plugin --profile web add dsh-multi-tenant
DSH_MULTI_TENANT_STARTER=1 dsh web
```

然后打开 DSH 输出的 URL，再访问 `/_dsh-multi-tenant`。

starter 默认休眠，页面提供三组 identity：

```text
Acme / Alice
Acme / Bob
Globex / Alice
```

它使用真实 DSH Agent、官方 DSH MCP client 和真实 stdio MCP JSON-RPC Tool，可以直接看到：

- Acme/Alice 解析为正确 Tenant / Principal；
- 真实 MCP `tools/list` + `tools/call`；
- Principal credential 到达 MCP，并只返回 `credentialAccepted: true`，不暴露 raw credential；
- owner Session resume；
- Acme/Bob 访问 Alice Session 被拒绝；
- Globex/Alice 证明第二 Tenant。

这个 panel 挂在现有 DSH Web **旁边**，使用同一个 `ctx.webServer`；不是第二套聊天前端，也不是第二个 HTTP server。

## Quick start

`createMcpSaaSRuntime()` 是现有 Core 之上的 opinionated MCP-specific product facade：

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
      return loadPrincipalCredentials(principal)
    },
  },
})

const principal = await app.resolve(trustedSubject)
const handle = await principal.create({ sessionId })
```

这个 facade 只是组合现有 `CompositionPlan`、`RuntimeComposition`、Product Ingress 与 `createMcpAgentIntegration()`，不会创建第二套 Runtime 或 DI system。

`create()` resolve 时，官方 MCP client 已完成 initial connection、`tools/list` 同步和 Tool registration；`resume()` 会在 DSH persistence/setup 之前检查 Session ownership。

### 已有 JWT / Cookie / req.user 怎么接

Web bridge 只消费现有 authentication stack 的可信结果：

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

`readBearerToken()` / `readCookie()` 只是 transport extractor，不负责 authentication。JWT verification、OIDC、server-session validation、refresh、user lookup 继续归产品。

## 0.3 给你的能力

- trusted product identity -> canonical Tenant / Principal；
- exact `CompositionPlan -> RuntimeComposition` binding；
- Principal-scoped replaceable credentials；
- Tenant-scoped MCP configuration；
- Principal-bound Agent `create()` / `resume()`；
- immutable、fail-closed Session ownership；
- zero-external-service SQLite ownership persistence，重启后 owner 仍保留；
- deterministic per-Session MCP namespace；
- Principal-owned long-lived Agent；
- 官方 DSH MCP Tools integration；
- MCP-specific product facade；
- same-server DSH Web identity/admission bridge；
- secret-safe structured diagnostics；
- opt-in real-DSH-Web starter；
- permanent FPE + durable-local executable evidence；
- clean installed-artifact / registry verification。

## Architecture

```text
Product authentication
  -> trusted subject
  -> Product Web bridge / Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal credentials
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> official @deepseek-ai/dsh-mcp-client
  -> native Agent-scoped MCP Tools
```

职责边界保持很小：

- Product 管 authentication；
- Core 管 identity、composition、lifecycle；
- Integration 管 downstream protocol/configuration；
- Principal 拥有 long-lived Agent；
- DSH 管 MCP wire behavior 与 Tool discovery。

## Diagnostics

产品侧只暴露稳定、secret-safe 的错误层次：

```json
{
  "code": "SESSION_ACCESS_DENIED",
  "stage": "session-ownership",
  "message": "This Session belongs to another Principal."
}
```

Pinned 官方 MCP client 会把 initial connect/discovery/register 合并成一次 activation failure，所以这里不会在上游无法证明时猜测更细错误阶段。

## Security boundary

Cordis Context 提供 trusted same-process identity/lifecycle separation，不是 hostile-code sandbox。真正的 secret/process/filesystem/network 强隔离属于 process/container/Pod/sidecar/remote boundary。

Pinned DSH Web 目前也不会给每个 stock Web RPC business method materialize product-authenticated Principal Context。rc.3 严格保证的是 product-aware identity + Agent create/resume admission + Session ownership，而不是“所有 stock RPC 自动 tenant-authorized”。这是 #41 已经明确承认的边界。

生产 Web 暴露推荐把 DSH Web 放在 Product Gateway/BFF 后面的私网/loopback：Gateway 负责 authentication、canonical Tenant/Principal resolution 和受保护 Session/Agent resource authorization，然后才转发到 DSH。公网客户端不能绕过 Gateway 直接访问 stock DSH `/api`。

SQLite 同样只承诺 individual developer / single-node restart durability，不宣称 multi-replica production persistence。

starter 的 demo cookie 不是生产 authentication 机制。

## Compatibility

- Node：`^22.19.0 || >=24.0.0`
- Cordis：`>=4.0.1 <5`
- DSH：`0.1.1-rc.2`

发布前 `pnpm release:check` 会同时执行真实 DSH Web First Product Experience proof 和独立进程 SQLite restart/competition proof。

## Public Subpaths

```text
dsh-multi-tenant
dsh-multi-tenant/runtime
dsh-multi-tenant/operation
dsh-multi-tenant/composition
dsh-multi-tenant/runtime-composition
dsh-multi-tenant/ingress
dsh-multi-tenant/credentials
dsh-multi-tenant/mcp
dsh-multi-tenant/product
dsh-multi-tenant/web
dsh-multi-tenant/diagnostics
dsh-multi-tenant/starter
dsh-multi-tenant/store
dsh-multi-tenant/sqlite-store
dsh-multi-tenant/testing
```