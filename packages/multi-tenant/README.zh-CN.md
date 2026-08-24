# dsh-multi-tenant

面向 DeepSeek Harness 的 context-native Multi-Tenant Runtime 与 v0.3 SaaS Framework Core primitives。

> Package release identity：**`dsh-multi-tenant@0.3.0-rc.1`**。
>
> Compatible DSH baseline：`0.1.1-rc.2` @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。

## Product-facing Path

```text
trusted product subject
  -> Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> Tenant MCP Config + Principal Credentials
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> 官方 DSH MCP client
  -> native Agent-scoped MCP Tools
```

### 1. Compile 并绑定一张 Plan

```ts
const plan = compileSaaSDefinition(definition)
const app = await materializeRuntimeComposition(ctx, plan)
```

`RuntimeComposition` 持有 exact whole-plan attestation。同一 Plan join / single-flight；同一 root 上 active whole Plan 不同会抛 `RuntimeCompositionConflictError`。Canonical Tenant / Principal drift 仍使用 scope-local fingerprint。

### 2. Resolve Trusted Product Subject

```ts
const ingress = createProductIngress(app, subject => ({
  tenantId: subject.organization,
  userId: subject.account,
}))

const principal = await ingress.resolve(subject)
```

Authentication 不进入 Core。Resolver 接收的是产品已经信任的 subject。

### 3. Principal Credentials

```ts
const credentialsProvider = definePrincipalCredentialsProvider({
  id: 'credentials',
  definitionKey: 'v1',
  create({ principal }) {
    return new InMemoryPrincipalCredentials({
      erpApiToken: loadTokenFor(principal),
    })
  },
})
```

`principalCredentials` 是 canonical `CapabilityToken<PrincipalCredentials, 'principal'>`，随 Principal lifecycle 隔离，provider 可替换而不用修改 Core。`InMemoryPrincipalCredentials` 只用于 reference / test，不是 production secret store。

`PrincipalCredentials` 被明确定位为**当前阶段的 low-level primitive**，不是长期推荐让 Agent 直接拿 raw token 的承诺。长期方向仍是 service-specific Integration Plugin 提供 typed client / transport，并让 authority / credential Broker plugin 把 secret 留在更窄的边界后面；这个 Vision 当前不冻结 API。

## MCP Agent Integration

M5 新增真实 Tenant MCP capability 与 Principal-bound DSH Agent integration。

```ts
const mcpProvider = defineTenantMcpConfigProvider({
  id: 'tenant-mcp',
  definitionKey: 'v1',
  load({ tenantId }) {
    return {
      servers: [{
        transport: 'streamable-http',
        serverName: 'erp',
        url: endpointFor(tenantId),
        credentialHeaders: {
          Authorization: { credential: 'erpApiToken', prefix: 'Bearer ' },
        },
      }],
    }
  },
})

const plan = compileSaaSDefinition({
  capabilities: [
    { capability: tenantMcpConfig, required: true },
    { capability: principalCredentials, required: true },
  ],
  providers: [mcpProvider, credentialsProvider],
})

const app = await materializeRuntimeComposition(ctx, plan)
const ingress = createProductIngress(app, subject => ({
  tenantId: subject.organization,
  userId: subject.account,
}))
const principal = await ingress.resolve(subject)
const mcp = createMcpAgentIntegration(principal)

const handle = await mcp.create({ sessionId })
```

`create()` 在进入 DSH setup 前先 reserve Session ownership；`resume()` 在任何 DSH persistence / setup 前先检查 Session ownership。Integration 在 Agent setup 内挂载 compatible 官方 `@deepseek-ai/dsh-mcp-client`，并把 startup failure 当成 fatal，因此返回的 Agent 已完成第一次 MCP discovery 并拥有 initial MCP Tools。

Long-lived Agent 通过 canonical Principal Context 创建，而不是由短生命周期 Operation Fiber 拥有。因此 create/resume Operation 结束后 Agent 继续存活，但 Principal teardown 仍会结构性回收它。

每个 logical MCP server 会按 Principal Session 派生 deterministic runtime namespace；返回 handle 暴露 mapping：

```ts
handle.servers
// [{ serverName: 'erp', runtimeServerName: 'erp-...', toolPrefix: 'mcp__erp-...__' }]
```

这是为了适配 pinned 官方 MCP client 在 Cordis root 上的 `serverName` reservation，同时保留 DSH ToolRuntime 的 Agent-scope registration；同一个 Session resume 后 namespace 保持稳定。

M5 只支持官方 MCP **Tools** 路径，不造平行 MCP stack，也不桥接 pinned Harness 当前没有 consumer 的 Resources / Prompts。

### One-shot Work vs Live Agent Lifetime

Integration 内部会启动一次 Principal-owned Operation，只 capture 一次 `TenantMcpConfig + PrincipalCredentials` 并完成 create/resume authorization。这个 Operation 是短生命周期；最终 DSH Agent 是 Principal-owned long-lived resource。

## Low-level Runtime

v0.2 API 仍通过 `runtime` / `operation` / `composition` subpath 提供给 framework / integration code。产品代码优先使用 `runtime-composition`，避免手工把 Deployment / Tenant / Principal / Operation recipe 在不同 Plan 之间混搭。

## Guarantees

- claim-once immutable Session ownership / fail-closed access；
- canonical Tenant / Principal publication / quiescent teardown；
- typed capability scope / dependency validation；
- scope-local canonical fingerprint；
- exact whole-plan RuntimeComposition attestation；
- trusted ingress -> canonical Principal；
- Principal Credentials isolation / replacement；
- Tenant MCP config isolation；
- cross-Principal resume 在 DSH resume 前拒绝；
- one-shot Operation + Principal-owned long-lived Agent；
- 官方 DSH MCP client 在 Agent publication 前完成 initial discovery；
- Agent-scoped native MCP Tools + deterministic per-Session runtime namespace；
- pinned real DSH / MCP executable evidence；
- clean installed-artifact smoke 验证 packed npm candidate。

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

## MCP Runtime Requirement

`dsh-multi-tenant/mcp` 在运行时组合 compatible DSH installation 提供的官方 `@deepseek-ai/dsh-mcp-client`。`0.3.0-rc.1` release gate 会把**打包后的 `dsh-multi-tenant` artifact 与 `@deepseek-ai/dsh@0.1.1-rc.2` 安装到干净 consumer，并真正触发已打包 M5 路径**，证明这个解析关系在支持的安装布局下成立。本项目不 vendor / fork MCP protocol implementation。

## Security Boundary

Cordis Context 是 trusted same-process isolation / composition，不是 hostile-code sandbox。M5 把 credential binding 的真实值限制在 Agent setup plumbing 中，减少正常路径上的 secret 暴露，但无法防御共享进程的恶意代码。Filesystem / process / network / shell / secret strong isolation 属于 container / Pod / sidecar / remote deployment architecture。

长期 authority-capability Vision 见仓库 `docs/vision/authority-capabilities.zh-CN.md`，它不是当前 npm API contract。

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

## Verify

```sh
pnpm release:check
```
