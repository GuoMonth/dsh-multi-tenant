[English](./README.md) | 简体中文

# dsh-multi-tenant

**让 DeepSeek Harness 真正变成一个可以承载 SaaS 产品的 Multi-Tenant Agent Runtime。**

如果你已经认可 DeepSeek Harness 的 Agent 执行模型，但准备把它放进一个真正的 SaaS 产品，那么最先变复杂的通常不是模型，而是这几件事：**这个请求属于谁、能拿哪份 credential、应该连接哪个 MCP、能不能恢复某个 Session，以及这个长生命周期 Agent 最终归谁管理。**

> Release candidate：**`dsh-multi-tenant@0.3.0-rc.1`**
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

这时候如果没有明确的 Runtime boundary，下面的问题很快会变成产品 bug 或安全 bug：

- 这个请求到底属于哪个 Tenant / Principal？
- 这个 Tenant 应该连接哪个 MCP endpoint / config？
- 这个 Principal 应该使用哪份 credential？
- Bob 能不能 resume Alice 的 Session？
- 不同 Tenant 都叫 `erp` 的 MCP server，会不会撞 namespace？
- MCP / Agent setup 失败时，会不会留下 half-configured Agent？
- Principal 被销毁时，它持有的 long-lived Agent 与 MCP tools 是否真正被 drain？

`dsh-multi-tenant` 就是来处理这层 **产品身份 + Runtime ownership + Session safety + DSH Agent integration** 的，同时继续复用 Cordis / DSH 原生生命周期，不再造一套平行 Runtime。

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
trusted product subject
  -> Product Ingress
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> fail-closed Session ownership
  -> Principal-bound create/resume
  -> native DSH Agent + MCP Tools
```

`0.3` 直接给你：

- trusted product subject -> canonical `Tenant / Principal`；
- exact `CompositionPlan -> RuntimeComposition` binding，避免产品层偷偷混用不同 Plan；
- Principal-scoped replaceable credentials；
- Tenant-scoped MCP configuration；
- Principal-bound Agent `create()` / `resume()`；
- immutable、fail-closed Session ownership；
- 官方 `@deepseek-ai/dsh-mcp-client` integration，不重造 MCP protocol stack；
- native Agent-scoped MCP Tools；
- long-lived Agent 归 Principal 所有，不挂在一次短请求 Operation 上；
- clean installed-artifact 与 post-publication registry verification。

## 安装

正常 DSH profile：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

如果你的 framework code 本身已经拥有 compatible DSH installation：

```sh
pnpm add dsh-multi-tenant
```

MCP integration 会复用 compatible DSH installation 自带的官方 MCP client，而不是在本项目里 vendor / fork 一份。

## 最短产品链路

Authentication 仍然由你的产品负责。请求已经可信以后，把它映射成 Tenant / Principal，提供 Tenant MCP config 与 Principal credentials，然后 create / resume Agent。

```ts
const plan = compileSaaSDefinition({
  capabilities: [
    { capability: tenantMcpConfig, required: true },
    { capability: principalCredentials, required: true },
  ],
  providers: [
    defineTenantMcpConfigProvider({
      id: 'tenant-mcp',
      load({ tenantId }) {
        return {
          servers: [{
            transport: 'streamable-http',
            serverName: 'erp',
            url: endpointFor(tenantId),
            credentialHeaders: {
              Authorization: { credential: 'erpToken', prefix: 'Bearer ' },
            },
          }],
        }
      },
    }),
    definePrincipalCredentialsProvider({
      id: 'credentials',
      create({ principal }) {
        return loadCredentialsFor(principal)
      },
    }),
  ],
})

const app = await materializeRuntimeComposition(ctx, plan)
const ingress = createProductIngress(app, resolveTrustedSubject)
const principal = await ingress.resolve(subject)

const agents = createMcpAgentIntegration(principal)
const handle = await agents.create({ sessionId })
```

`create()` resolve 时，官方 MCP client 已经在 Agent setup 中完成 initial discovery，因此返回的 Agent 已经拥有 native MCP Tools。`resume()` 会在触发 DSH persistence / setup 之前先检查 Session ownership。

## 技术架构

```text
Product / Transport authentication
        ↓ trusted subject
Product Ingress
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

核心 ownership 规则刻意保持很小：

- **Product owns authentication**：Core 从 identity 已经可信以后开始。
- **Core owns identity / lifecycle / composition**：它不是 vendor auth framework，也不是 ERP framework。
- **Operation 是短生命周期 semantic work**：required capability 只 capture 一次，也不拥有 long-lived Agent。
- **Principal owns Agent**：Principal teardown 会 drain 自己的 Agents 与 Agent-scoped MCP resources。
- **DSH owns MCP wire behavior**：项目只组合官方 MCP client，不重造 MCP。

详见 [`docs/specs/architecture.zh-CN.md`](./docs/specs/architecture.zh-CN.md)、[`docs/specs/product-ingress-credentials.zh-CN.md`](./docs/specs/product-ingress-credentials.zh-CN.md)、[`docs/specs/mcp-agent-integration.zh-CN.md`](./docs/specs/mcp-agent-integration.zh-CN.md)。

## 安全边界

项目提供 trusted code 场景下很强的 **same-process identity / lifecycle separation**，但 Cordis Context 不是 hostile-code sandbox。能任意读 process memory、filesystem、shell、network 的恶意同进程代码不在保证范围内。

需要 hostile-code isolation 或 secret non-disclosure 时，应该使用 process / container / Pod / sidecar / remote authority boundary。

## Compatibility 与 Release Evidence

- Node：`^22.19.0 || >=24.0.0`
- Cordis：`>=4.0.1 <5`
- DSH：`0.1.1-rc.2` + 上面的精确 release commit

CI 会证明真实外部 DSH / Cordis assumptions、真实 stdio MCP server、真实 `tools/list`、真实 DSH `ToolRuntime.execute()` -> MCP `tools/call`、并发 Tenant / Principal isolation、cross-Principal resume denial、startup failure、teardown，以及真正打包后的 npm artifact。

详见 [`docs/reference/compatibility.zh-CN.md`](./docs/reference/compatibility.zh-CN.md)。

## 接下来往哪里走

当前 `PrincipalCredentials` 仍然是 low-level primitive。长期更希望往 **Capability-as-Authority** 演进：Operation 消费 `ErpClient` / transport 这类 typed ability，secret 尽量留在可替换 Broker / authority plugin 后面。

这只是 Vision，不是冻结的 `0.3` API。详见 [`docs/vision/authority-capabilities.zh-CN.md`](./docs/vision/authority-capabilities.zh-CN.md) 与 [`DIRECTION.zh-CN.md`](./DIRECTION.zh-CN.md)。

## Release 状态

`0.3.0-rc.1` 仍然是 prerelease，而且项目会继续快速推进。真实 integration 如果证明当前 contract 不够好，后续允许 deliberate breaking change。

当前 live tree 只保留 `0.3` 仍有用的 release 文档和发布基建；旧 v0.1 / v0.2 的 prerelease archaeology 留在 Git history / tag 里，不继续污染主分支。

详见 [`docs/releases/v0.3.0-rc.1.md`](./docs/releases/v0.3.0-rc.1.md) 与 [`docs/reference/release.zh-CN.md`](./docs/reference/release.zh-CN.md)。

## License

MIT
