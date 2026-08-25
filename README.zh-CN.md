[English](./README.md) | 简体中文

# dsh-multi-tenant

**让 DeepSeek Harness 真正变成一个可以承载 SaaS 产品的 Multi-Tenant Agent Runtime。**

如果你已经认可 DeepSeek Harness 的 Agent 执行模型，但准备把它放进真正的 SaaS 产品，那么最先变复杂的通常不是模型，而是这几件事：**这个请求属于谁、能拿哪份 credential、应该连接哪个 MCP、能不能恢复某个 Session，以及这个长生命周期 Agent 最终归谁管理。**

> 当前已发布版本：**`dsh-multi-tenant@0.3.0-rc.1`**
>
> 当前分支正在实现已经冻结的 **`0.3.0-rc.2` First Product Experience**。
>
> Compatible DSH baseline：`0.1.1-rc.2` / `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。

## SaaS 化真正麻烦的地方

单用户 Agent 很简单：

```text
request -> Agent -> MCP -> backend
```

但共享 Runtime 以后，真实情况更像：

```text
Acme / Alice   -> Acme ERP MCP + Alice credential + Alice Sessions
Acme / Bob     -> Acme ERP MCP + Bob credential   + Bob Sessions
Globex / Alice -> Globex ERP MCP + Globex/Alice credential + Globex Sessions
```

如果没有明确 Runtime boundary，Tenant lookup、credential plumbing、MCP setup、Session authorization、Agent lifecycle 很快都会变成产品 bug 或安全 bug。

`dsh-multi-tenant` 就是处理 **产品身份 + Runtime ownership + Session safety + DSH Agent integration** 这一层，同时继续复用 Cordis / DSH 原生生命周期，不造第二套 Runtime。

## 先看到价值，再接产品

`0.3.0-rc.2` 增加了一个显式 opt-in 的 First Product Experience，直接跑在官方 DSH Web profile 上：

```sh
dsh plugin --profile web add dsh-multi-tenant
DSH_MULTI_TENANT_STARTER=1 dsh web
```

然后打开 DSH 打印出来的地址，再访问 `/_dsh-multi-tenant`。

starter **默认休眠**；只有显式设置 `DSH_MULTI_TENANT_STARTER=1` 才会发布 demo identities / routes。

页面可以切换：

```text
Acme / Alice
Acme / Bob
Globex / Alice
```

并直接验证：

```text
demo product login
  -> trusted subject
  -> canonical Tenant / Principal
  -> Principal-bound DSH Agent
  -> 官方 @deepseek-ai/dsh-mcp-client
  -> 真实 stdio MCP tools/list + tools/call
  -> 肉眼可见的 identity / Session isolation
```

starter MCP Tool 会返回 Tenant、Principal 和 `credentialAccepted: true`。Principal credential 确实被注入 MCP child process，但 raw credential 不会出现在浏览器响应或 model-facing Tool result 里。

然后从 Acme/Alice 切到 Acme/Bob，尝试 resume Alice Session，会在 DSH resume/persistence setup 之前被拒绝。Globex/Alice 则证明第二个 Tenant 也走同一套 Runtime path。

这个 panel 挂在真实 DSH Web **旁边**，使用同一个 `ctx.webServer`；它不是第二套聊天前端，也不是第二个 HTTP server。

## 安装

正常 DSH profile：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

如果 framework code 本身已经拥有 compatible DSH installation：

```sh
pnpm add dsh-multi-tenant
```

MCP integration 继续复用 compatible DSH installation 自带的官方 MCP client，不 vendor / fork MCP。

## 最短产品链路

Authentication 仍然由你的产品负责。`0.3.0-rc.2` 增加一个薄的 MCP-specific facade，让第一次成功只需要处理四个产品 seam：trusted identity、Tenant MCP config、Principal credentials、Agent create/resume。

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
      return loadCredentialsFor(principal)
    },
  },
})

const principal = await app.resolve(trustedSubject)
const handle = await principal.create({ sessionId })
```

这个 facade 不会替代 Core。它只是把已经存在的 `CompositionPlan`、`RuntimeComposition`、Product Ingress、`createMcpAgentIntegration()` 组合成当前最短 happy path；高级使用者仍然可以直接使用底层 primitives。

`create()` resolve 时，官方 MCP client 已经在 unpublished Agent setup 中完成 initial connection、`tools/list` 同步和 Tool registration；`resume()` 会先检查 Session ownership，再进入 DSH persistence/setup。

### 已有 JWT / Cookie / req.user 怎么接

Web bridge 不负责重新发明认证，只消费你现有认证体系的可信结果：

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

`readBearerToken()` / `readCookie()` 只是 transport extractor。JWT signature、OIDC、server session、refresh、`req.user` construction 继续归产品自己。

## 加上它以后有什么变化

```text
之前
----
product request
  -> 自己写 tenant 判断
  -> 自己拼 credential
  -> 自己挂 MCP
  -> 自己约束 Session
  -> DSH Agent

之后
----
已经认证过的 product subject
  -> Product Ingress / Web bridge
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> fail-closed Session ownership
  -> Principal-bound create/resume
  -> native DSH Agent + MCP Tools
```

`0.3` 直接给你：

- trusted product subject -> canonical `Tenant / Principal`；
- exact `CompositionPlan -> RuntimeComposition` binding；
- Principal-scoped replaceable credentials；
- Tenant-scoped MCP configuration；
- Principal-bound Agent `create()` / `resume()`；
- immutable、fail-closed Session ownership；
- 官方 `@deepseek-ai/dsh-mcp-client` integration；
- native Agent-scoped MCP Tools；
- long-lived Agent 归 Principal 所有；
- MCP-specific product facade，而不是第二套 Runtime；
- same-server Web identity/admission bridge；
- secret-safe structured diagnostics；
- opt-in runnable starter + permanent real-DSH-Web CI evidence。

## 技术架构

```text
Product / Transport authentication
        ↓ trusted subject
Product Web bridge / Product Ingress
        ↓ TenantPrincipal
RuntimeComposition                 exact whole-plan attestation
        ↓
canonical Tenant                   Tenant MCP config
        ↓
canonical Principal                Principal Credentials
        ↓
one-shot create/resume Operation   authorization + snapshot
        ↓
Principal-owned DSH Agent          long-lived
        ↓ setup before publication
官方 @deepseek-ai/dsh-mcp-client
        ↓
native Agent-scoped MCP Tools
```

核心 ownership 规则仍然刻意保持很小：

- **Product owns authentication**：Core 从 identity 已经可信以后开始。
- **Core owns identity / lifecycle / composition**。
- **Product facade 保持薄且 MCP-specific**：不创建第二套 Runtime。
- **Operation 是短生命周期 semantic work**：不拥有 long-lived Agent。
- **Principal owns Agent**：Principal teardown drain 自己的 Agent / MCP resources。
- **DSH owns MCP wire behavior**：本项目只组合官方 MCP client。

详见 [`docs/specs/architecture.zh-CN.md`](./docs/specs/architecture.zh-CN.md)、[`docs/specs/product-ingress-credentials.zh-CN.md`](./docs/specs/product-ingress-credentials.zh-CN.md)、[`docs/specs/mcp-agent-integration.zh-CN.md`](./docs/specs/mcp-agent-integration.zh-CN.md)。

## Web 边界要说清楚

Pinned DSH Web 已经有 trusted-host `/api` carrier，也会把 HTTP header 带到 transport request；但它当前不会为每一个已有 stock Web RPC business method materialize 一个产品认证后的 Principal Context。

所以 rc.2 严格保证的是 **product identity + Agent create/resume admission** Principal-aware / fail-closed。我们不会因为 starter 页面上有“登录切换”就宣称所有 stock DSH Web RPC 自动 tenant-authorized。

这是需要后续认真解决的 upstream integration seam，不应该用一个看起来很安全的假登录遮过去。

## First-use diagnostics

对产品/浏览器暴露的是稳定、secret-safe 的错误：

```json
{
  "code": "SESSION_ACCESS_DENIED",
  "stage": "session-ownership",
  "message": "This Session belongs to another Principal."
}
```

原始 vendor/auth/credential error 只保留在 server-side `cause`，不会被 `toProductDiagnostic()` 序列化。

当前 stage 覆盖 identity resolution、Tenant MCP config、Principal credentials、Session ownership、MCP setup，以及能够显式证明的 post-create MCP discovery check。Pinned 官方 MCP client 把 initial connect/discovery/register 合并为一次 activation failure，所以我们不会在上游无法证明时编造更细的错误阶段。

## 安全边界

项目提供 trusted code 场景下很强的 **same-process identity / lifecycle separation**，但 Cordis Context 不是 hostile-code sandbox。真正的 secret/process/filesystem/network 强隔离应该放在 process/container/Pod/sidecar/remote authority boundary。

starter 只是 MVP proof：它的本地 demo cookie 不是生产认证方案；Tool 不返回 demo credential，也不代表同进程已经变成 hostile-code sandbox。

## Compatibility 与可执行证据

- Node：`^22.19.0 || >=24.0.0`
- Cordis：`>=4.0.1 <5`
- DSH：`0.1.1-rc.2` + 上面的精确 release commit

原有 CI 继续验证真实 DSH/Cordis assumptions、真实 stdio MCP `tools/list`、真实 `ToolRuntime.execute()` -> `tools/call`、并发 Tenant/Principal isolation、cross-Principal resume denial、startup failure、teardown 与 packed artifact。

rc.2 新增 permanent First Product Experience lane：pack 当前 candidate -> clean pinned DSH Web profile -> 真正启动 `dsh web` -> 通过 HTTP 跑 login/identity/Agent/MCP/Session -> 验证第二 Tenant -> 扫描 HTTP/stdout/stderr 确保 raw starter credential 没有泄漏。

详见 [`docs/reference/compatibility.zh-CN.md`](./docs/reference/compatibility.zh-CN.md)。

## 范围控制

`0.3.0-rc.2` 是一个 MVP value-validation release。下面这些明确不阻塞：

- Redis/Postgres/MySQL production Session Store；
- universal Credential Broker / Capability-as-Authority；
- generic OAuth/OIDC/token refresh framework；
- Permission/Policy plugin 与完整 Audit/OTel product；
- 第二个 ERP/direct-API integration；
- hostile-code strong isolation；
- MCP Resources/Prompts；
- replacement frontend 或 broad Desktop/CLI packaging。

完整范围见 [`docs/scopes/v0.3.0-rc.2.zh-CN.md`](./docs/scopes/v0.3.0-rc.2.zh-CN.md)。

## 接下来往哪里走

当前 `PrincipalCredentials` 仍然是 low-level primitive。长期更希望往 **Capability-as-Authority** 演进：Operation 消费 `ErpClient` / transport 这类 typed ability，secret 尽量留在可替换 Broker / authority plugin 后面。

这只是 Vision，不是冻结的 `0.3` API。详见 [`docs/vision/authority-capabilities.zh-CN.md`](./docs/vision/authority-capabilities.zh-CN.md) 与 [`DIRECTION.zh-CN.md`](./DIRECTION.zh-CN.md)。

## Release 状态

`0.3.0-rc.1` 仍是当前已发布 prerelease。这个 PR 实现 frozen rc.2 scope，但不会在这里自动 publish。

live tree 只保留当前 `0.3` 仍有用的文档和 release infrastructure；旧 prerelease archaeology 留在 Git history/tag。

详见 [`docs/releases/v0.3.0-rc.1.md`](./docs/releases/v0.3.0-rc.1.md)、[`docs/scopes/v0.3.0-rc.2.zh-CN.md`](./docs/scopes/v0.3.0-rc.2.zh-CN.md) 与 [`docs/reference/release.zh-CN.md`](./docs/reference/release.zh-CN.md)。

## License

MIT