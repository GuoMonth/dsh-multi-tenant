# dsh-multi-tenant

**让 DeepSeek Harness 可以安全地跑在真正的 Multi-Tenant SaaS 产品后面。**

当一个 DSH Runtime 要同时服务多个组织和多个用户，而且 Tenant config、Principal credential、Session ownership、Agent-scoped MCP Tools 不能串时，就用这个 package。

> **`dsh-multi-tenant@0.3.0-rc.1`** 仍是当前已发布 prerelease；这个分支实现已经冻结的 `0.3.0-rc.2` First Product Experience。Compatible DSH baseline：`0.1.1-rc.2`。

## 它解决的问题

单用户 Agent 很简单：

```text
request -> Agent -> MCP -> backend
```

SaaS Agent Runtime 真正要保证的是：

```text
Acme / Alice   -> Acme MCP + Alice credential + Alice Sessions
Acme / Bob     -> Acme MCP + Bob credential   + Bob Sessions
Globex / Alice -> Globex MCP + Globex/Alice credential + Globex Sessions
```

`dsh-multi-tenant` 把重复的 Tenant 查找、credential plumbing、MCP setup、Session authorization 和 Agent lifecycle 收敛成一条产品链路：

```text
产品已经认证过的 subject
  -> Tenant / Principal
  -> Tenant MCP config
  -> Principal credentials
  -> fail-closed Session ownership
  -> Principal-bound Agent create/resume
  -> native DSH MCP Tools
```

## 安装

Compatible DSH profile：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

如果 framework code 本身已经拥有 compatible DSH installation：

```sh
pnpm add dsh-multi-tenant
```

MCP 路径直接复用 DSH installation 提供的官方 `@deepseek-ai/dsh-mcp-client`，本项目不 vendor / fork MCP。

### 先跑一下 MVP，再接你的产品

把它安装进官方 Web profile，显式打开 starter：

```sh
dsh plugin --profile web add dsh-multi-tenant
DSH_MULTI_TENANT_STARTER=1 dsh web
```

然后打开 DSH 打印出来的 URL，再访问 `/_dsh-multi-tenant`。

starter **默认休眠**；只有设置 `DSH_MULTI_TENANT_STARTER=1` 才会发布 demo identity 和 demo routes。

页面上可以直接切换：

```text
Acme / Alice
Acme / Bob
Globex / Alice
```

你可以看到：

- 当前登录 subject 被 materialize 成哪个 Tenant / Principal；
- 创建真实 DSH Agent；
- 通过官方 DSH MCP client 发现并调用真实 stdio MCP `who_am_i` Tool；
- MCP Tool 返回 Tenant / Principal，并用 `credentialAccepted: true` 证明 Principal credential 确实到达 MCP 进程，但不返回 credential 原文；
- Alice 可以使用自己的 Session；
- 切到 Bob 后 resume Alice Session 会被拒绝；
- Globex / Alice 证明第二个 Tenant 也走同一套 runtime。

这个页面只是挂在真实 DSH Web **旁边**的 identity / admission / proof panel，不是另写一套聊天前端。

## Quick Start

`0.3.0-rc.2` 给普通产品代码增加了一个 MCP-specific facade。首次成功只需要想清楚四件事：identity、Tenant MCP config、Principal credentials、Agent create/resume。

```ts
import { createMcpSaaSRuntime } from 'dsh-multi-tenant'

const app = await createMcpSaaSRuntime(ctx, {
  identity(subject: TrustedSubject) {
    // subject 已经由你的产品完成认证。
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

`createMcpSaaSRuntime()` 没有替代 `CompositionPlan`、`RuntimeComposition`、`ProductIngress` 或 `createMcpAgentIntegration`，它只是把这些已经验证过的 Core primitives 组合成目前最短的产品 happy path。高级使用者仍然可以直接使用 Core。

`create()` resolve 时，官方 MCP client 已完成 initial connection、`tools/list` 同步和 Tool registration；`resume()` 会在 DSH persistence/setup 之前检查 Session ownership。

### Web identity bridge

Authentication 继续由产品负责。bridge 只吃“认证完成后的结果”：

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

`readBearerToken()` / `readCookie()` 只是 transport extractor，不负责认证。JWT signature、OIDC、server session、refresh、user lookup 继续归你的产品已有认证体系。

## 0.3 给你的能力

- trusted product identity -> canonical Tenant / Principal；
- exact `CompositionPlan -> RuntimeComposition` binding；
- Principal-scoped replaceable credentials；
- Tenant-scoped MCP configuration；
- Principal-bound Agent `create()` / `resume()`；
- immutable、fail-closed Session ownership；
- deterministic per-Session MCP namespace；
- Principal-owned long-lived Agent；
- 官方 DSH MCP Tools integration；
- MCP-specific product facade，而不是第二套 Runtime；
- 挂在同一个 DSH WebServer 上的 identity/admission bridge；
- secret-safe structured diagnostics；
- opt-in runnable starter + permanent real-Web E2E evidence。

## 技术架构

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

原则仍然很小：

- Product 管 authentication。
- Core 管 identity、composition、lifecycle。
- product facade 只是薄的 MCP-specific facade，不创建平行 Core。
- Operation 只拥有一次短生命周期 semantic decision，不拥有 Agent lifetime。
- Principal 拥有 long-lived Agent。
- DSH 拥有 MCP wire behavior 与 initial Tool discovery。

### Pinned DSH Web 的明确边界

Pinned DSH Web `/api` carrier 会保留 HTTP headers，也有自己的 host-trust fence；但它当前不会为每一个已有 stock Web RPC business method materialize 一个“产品已经认证过的 Principal Context”。

因此 rc.2 能严格保证的是 **product identity + Agent create/resume admission** 这条路径 Principal-aware / fail-closed；我们不会因为 starter 页面上有“登录切换”就宣称整个 stock DSH Web RPC 已经天然变成 tenant-authorized。

这个限制明确写出来，比做一个看起来很安全的假登录更可靠。

## Diagnostics

对浏览器/产品只暴露稳定、安全字段，例如：

```json
{
  "code": "SESSION_ACCESS_DENIED",
  "stage": "session-ownership",
  "message": "This Session belongs to another Principal."
}
```

原始 vendor/auth/credential error 只保留在 server-side `cause`，`toProductDiagnostic()` 不会把它序列化出去。

当前 stage 包括 identity、Tenant MCP config、Principal credential、Session ownership、MCP setup，以及可以明确证明的 post-create MCP discovery check。Pinned 官方 MCP client 会把 initial connect/discovery/register 作为一次 activation failure 返回，所以我们不会在上游无法证明时猜测更细的错误阶段。

## 安全边界

Cordis Context 提供 trusted same-process identity/lifecycle separation，不是 hostile-code sandbox。真正的 secret/process/filesystem/network 强隔离应该放在 process/container/Pod/sidecar/remote boundary。

starter 可以证明 product/MCP response 不泄漏 demo credential，但它的 demo cookie 不是生产 authentication 方案，也不提供 hostile-code isolation。

## Compatibility

- Node：`^22.19.0 || >=24.0.0`
- Cordis：`>=4.0.1 <5`
- DSH：`0.1.1-rc.2`

CI 除了继续验证 packed artifact + pinned DSH 之外，还会真正启动一个 clean `dsh web` profile，跑通 identity -> Agent -> official MCP client -> Tool，并验证 cross-Principal Session denial 和第二 Tenant。

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
dsh-multi-tenant/starter   # 仅 opt-in demo plugin
dsh-multi-tenant/store
dsh-multi-tenant/testing
```