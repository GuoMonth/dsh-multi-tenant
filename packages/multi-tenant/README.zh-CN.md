# dsh-multi-tenant

**面向 DeepSeek Harness 的 Multi-Tenant SaaS Runtime primitives。**

当一个 DSH 产品要同时服务多个组织和多个用户，而且 Tenant config、Principal credential、Session ownership、Agent-scoped MCP Tools 不能串时，就用这个 package。

> Package candidate：**`dsh-multi-tenant@0.3.0-rc.1`**
>
> Compatible DSH baseline：`0.1.1-rc.2`。

## 为什么要装它

产品开发者通常不想每次都自己重写下面这一整层：

```text
trusted user
  -> Tenant / Principal
  -> Tenant-specific MCP config
  -> Principal-specific credentials
  -> safe Session ownership
  -> DSH Agent create/resume
  -> native MCP Tools
```

这个 package 提供这条链需要的 Runtime / composition 能力；authentication、数据库、secret store、厂商业务协议继续属于你的产品或 integration plugin。

## 安装

Compatible DSH profile：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

如果 framework code 已经拥有 compatible DSH installation：

```sh
pnpm add dsh-multi-tenant
```

## Quick start

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

`create()` resolve 时，官方 DSH MCP client 已完成 initial discovery，返回的 Agent 已经拥有 native Agent-scoped MCP Tools。

## 核心产品 contract

### Product Ingress

Framework 从 authentication 之后开始。`createProductIngress()` 把产品已经信任的 subject 映射成 validated canonical Tenant / Principal。

### RuntimeComposition

一张精确 `CompositionPlan` 绑定一个 active product Runtime；同一 root 上不同 whole-plan identity 会 fail，而不是静默混用 Deployment / Tenant / Principal / Operation recipe。

### Principal Credentials

`principalCredentials` 是 replaceable Principal-scoped low-level credential capability。`InMemoryPrincipalCredentials` 仅用于 reference / test。

### Tenant MCP + Agent integration

`tenantMcpConfig` 是 Tenant-scoped。`createMcpAgentIntegration(principal)` 一次 capture Tenant MCP config + Principal credentials，检查 Session ownership，然后 create / resume Principal-owned long-lived DSH Agent。

Package 复用 compatible DSH installation 自带的官方 `@deepseek-ai/dsh-mcp-client`，不 vendor / fork MCP。

## Architecture

```text
trusted subject
  -> Product Ingress
  -> RuntimeComposition
  -> Tenant / Principal
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native Agent-scoped MCP Tools
```

## Public subpaths

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

## Security boundary

Cordis Context 提供 trusted same-process composition / lifecycle separation，不是 hostile-code isolation。更强的 secret / process / filesystem / network isolation 应由 process / container / Pod / sidecar / remote deployment boundary 提供。

## Compatibility

- Node：`^22.19.0 || >=24.0.0`
- Cordis：`>=4.0.1 <5`
- DSH baseline：`0.1.1-rc.2`

Repository release gate 会把 packed artifact 与 pinned DSH 一起安装到干净 consumer 验证，并在 npm publication 后重复验证 exact registry artifact。
