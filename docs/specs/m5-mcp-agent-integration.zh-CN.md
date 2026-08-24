[English](./m5-mcp-agent-integration.md) | 简体中文

# Spec —— M5 DSH-native MCP Agent Integration

> Status：v0.3 M5 implementation contract。只有 executable M5 probe 与 package / release gate 全绿后，本 Spec 才算完成。

## 使用者最终得到什么

M5 完成时，产品开发者只需要提供产品自己的身份解析、每 Tenant MCP 配置和每 Principal 凭证，就可以通过一个 Principal-bound integration surface 创建 / 恢复真正的 DSH Agent。

```text
trusted product request
  -> Product Ingress
  -> RuntimeComposition
  -> canonical Principal
  -> TenantMcpConfig + PrincipalCredentials
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> Agent setup
  -> 官方 @deepseek-ai/dsh-mcp-client
  -> Agent publication 前完成首次 tools/list
  -> native agent-scoped MCP Tools
```

产品不需要为了挂载 MCP Server 自己 new MCP SDK client、手工拼 DSH `ownerCtx`，也不需要把 credential 从 Runtime 拿出来再自己 fetch / spawn。

## Runtime Capabilities

M5 新增一个真实 Tenant-owned capability：

```ts
CapabilityToken<TenantMcpConfig, 'tenant'>
```

`TenantMcpConfig` 描述 logical MCP Server，并支持 pinned 官方 DSH MCP client 暴露的两种 transport：

- `stdio`；
- `streamable-http`。

静态 transport 配置属于 Tenant；credential binding 只引用已有 Principal-scoped `PrincipalCredentials` 中的 credential name，并在 Agent setup 时才解析真实值。

例如：

```ts
{
  transport: 'stdio',
  serverName: 'erp',
  command: 'node',
  args: ['erp-mcp.mjs'],
  env: { REGION: 'jp' },
  credentialEnv: {
    ERP_TOKEN: { credential: 'erpToken' },
  },
}
```

```ts
{
  transport: 'streamable-http',
  serverName: 'crm',
  url: 'https://crm.example/mcp',
  credentialHeaders: {
    Authorization: { credential: 'crmToken', prefix: 'Bearer ' },
  },
}
```

M5 不定义 universal Broker API。`PrincipalCredentials` 仍然是当前 low-level primitive；Integration 只把 raw value 留在可信 setup plumbing 内，不把 token 当作产品 Operation 的结果向外返回。

## Agent 生命周期

一次 create/resume 是 one-shot Principal Operation，因为 capability acquisition 与 authorization 必须只执行一次。

但 live DSH Agent **不能**由这个短 Operation Fiber 长期拥有。Agent 必须通过 canonical Principal Context 创建：

```text
Principal
  ├─ Operation(create/resume)   short-lived decision / snapshot
  └─ DSH Agent                  long-lived，Principal-owned
       └─ Agent-scoped MCP plugin(s)
```

这样 create/resume 返回后 Agent 仍然存活，同时 Principal teardown 仍能结构性回收 Agent。

## Session Ownership

### Create

在 DSH Agent creation 之前执行：

```text
claimSession(sessionId, principal)
```

v0 ownership store 明确没有 delete / release，因此 claim 是 durable **reservation**，不是可 rollback 的数据库事务。如果后面的 MCP / Agent setup 失败：

- 半配置 Agent 不能 publication；
- session id 继续属于原 Principal；
- 原 Principal 可以重试；
- 其他 Principal 永远不能趁失败抢占这个 id。

### Resume

必须先完成：

```text
assertSessionAccess(principal, sessionId)
```

之后才允许调用 `ctx.agents.resume()`。因此没有权限的调用者连别人的 DSH persistence load / Agent setup 都不能触发。

## DSH MCP Namespace

Pinned `@deepseek-ai/dsh-mcp-client` 在一个 Cordis root 内对 `serverName` 做 reservation，但从 `agent.ctx` 注册的 DSH ToolRuntime 工具本身是 Agent-scoped。

M5 因此从下面 identity 派生 deterministic physical server namespace：

```text
logical serverName + tenantId + userId + sessionId
```

结果：

- 满足官方 MCP client 的 32 字符 server-name contract；
- 同一个 Principal Session resume 后 namespace 不变；
- 多个并发 Agent 使用同一个 logical product server name 时通常不会发生 root reservation collision；
- 返回的 `McpAgentHandle` 暴露 mapping，方便 diagnostics 与 tool-prefix discovery。

最终 collision authority 仍然是官方 MCP client；极端 collision 必须 loud fail，不能静默串线。

## Publication Boundary

每个配置的 MCP Server 都按 startup failure fatal 处理。第一次 MCP connect + `tools/list` 必须在 DSH Agent `setup` boundary 内完成。

因此 `create()` / `resume()` 返回时，Agent 已拥有 initial native MCP tools；setup 失败则 unpublished Agent scope rollback。

## Tool Scope

MCP Tool 从 `agent.ctx` 注册，只能在对应 Agent 的 DSH scope 中可见，在 unscoped/global ToolRuntime view 中必须不可见。

M5 不把 Tenant / Principal isolation map 复制进 DSH 私有结构，也不创建第二套 Tool Registry。

## Required Executable Evidence

`scripts/m5-mcp-agent-integration-probe.mjs` 必须在 exact pinned public DSH packages、Node 22.19 与 Node 24 上证明：

1. DSH scope 共享 application Cordis root，且官方 MCP client root-wide enforce `serverName` reservation；
2. 真实 stdio MCP server 通过官方 client 启动；
3. 真实 `tools/list` 注册 native DSH tools；
4. Tool 通过 `ctx.tools.execute()` 真正跨 MCP wire 调用；
5. Acme/Alice、Acme/Bob、Globex/Alice 并发时分别观察到自己的 Tenant config / Principal credential；
6. MCP tools 是 Agent-scoped，不是 global；
7. cross-Principal resume 在 DSH Agent factory 被调用前拒绝；
8. same-Principal resume 保持稳定 runtime namespace；
9. MCP startup failure 不留下 live Agent，但保留 fail-closed Session reservation；
10. Agent / Principal teardown 清掉 MCP tools / connection。

## Non-goals

- MCP Resources / Prompts bridge；
- 平行 MCP protocol implementation；
- public universal Credential Broker；
- ERP abstraction / package；
- hostile same-process code isolation；
- 在 M5 里直接 bump / publish v0.3。
