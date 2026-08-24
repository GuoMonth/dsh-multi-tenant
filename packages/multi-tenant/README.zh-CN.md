# dsh-multi-tenant

**让 DeepSeek Harness 可以安全地跑在真正的 Multi-Tenant SaaS 产品后面。**

当一个 DSH Runtime 要同时服务多个组织和多个用户，而且 Tenant config、Principal credential、Session ownership、Agent-scoped MCP Tools 绝对不能串时，就用这个 package。

> **`dsh-multi-tenant@0.3.0-rc.1`** · compatible DSH baseline：`0.1.1-rc.2`

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

如果没有一层可复用 Runtime boundary，每个产品最终都会自己重复写 Tenant 查找、credential plumbing、MCP setup、Session authorization 和 Agent lifecycle。

`dsh-multi-tenant` 把它收敛成一条产品链路：

```text
trusted subject
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

## Quick Start

Authentication 由产品负责。请求已经可信以后，把它 resolve 成 Tenant / Principal，Runtime 负责把后面的多租户 Agent 链路组合起来。

```ts
const plan = compileSaaSDefinition({
  capabilities: [
    { capability: tenantMcpConfig, required: true },
    { capability: principalCredentials, required: true },
  ],
  providers: [mcpProvider, credentialsProvider],
})

const app = await materializeRuntimeComposition(ctx, plan)
const ingress = createProductIngress(app, resolveTrustedSubject)
const principal = await ingress.resolve(subject)

const agents = createMcpAgentIntegration(principal)
const handle = await agents.create({ sessionId })
```

`create()` resolve 时，官方 DSH MCP client 已经完成 initial discovery，Agent 已经拥有 native Agent-scoped MCP Tools。`resume()` 会在 DSH persistence / setup 之前检查 Session ownership。

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
- clean installed-artifact 与 post-publication registry verification。

## 技术架构

```text
Product authentication
  -> Product Ingress
  -> RuntimeComposition
  -> Tenant / Principal
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native Agent-scoped MCP Tools
```

边界很简单：

- Product 管 authentication。
- Core 管 identity、composition、lifecycle。
- Operation 只拥有一次短生命周期 semantic decision，不拥有 Agent lifetime。
- Principal 拥有 long-lived Agent。
- DSH 拥有 MCP wire behavior。

## 安全边界

Cordis Context 提供 trusted same-process identity / lifecycle separation，不是 hostile-code sandbox。真正的 secret / process / filesystem / network 强隔离应该放在 process / container / Pod / sidecar / remote boundary。

## Compatibility

- Node：`^22.19.0 || >=24.0.0`
- Cordis：`>=4.0.1 <5`
- DSH：`0.1.1-rc.2`

Release gate 会把真正打包后的 artifact 安装到 clean consumer，并与 pinned DSH 一起验证；发布以后再对 exact npm artifact 重跑同一份 consumer contract。

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
dsh-multi-tenant/store
dsh-multi-tenant/testing
```
