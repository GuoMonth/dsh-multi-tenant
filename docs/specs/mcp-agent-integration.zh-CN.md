[English](./mcp-agent-integration.md) | 简体中文

# Spec — DSH-native MCP Agent Integration

> 状态：已经实现的 `0.3` contract。

## 用户结果

产品开发者只需要提供产品自己的 identity resolution、per-Tenant MCP config 与 per-Principal credentials，然后通过一个 Principal-bound integration surface create / resume DSH Agent。

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
  -> Agent publication 前完成 initial tools/list
  -> native Agent-scoped MCP Tools
```

产品不需要为了挂载 MCP server 自己手搓 MCP SDK client、自己拼 DSH `ownerCtx`，也不需要把 credential 暴露给普通 Agent/application code。

## Runtime capability

`tenantMcpConfig` 是 Tenant-owned。当前 integration 支持 `stdio` 与 `streamable-http`。静态 transport config 属于 Tenant；credential binding 引用 Principal-scoped `PrincipalCredentials`，只在 Agent setup 中解析。

## Agent lifecycle

create/resume request 使用 one-shot Principal Operation，因为 capability acquisition 与 authorization 必须只执行一次。Live DSH Agent 通过 canonical Principal Context 创建，不属于短生命周期 Operation Fiber。

## Session ownership

`create()` 在 DSH Agent creation 前 claim Session ownership。这个 claim 是 durable reservation：setup failure 不会发布 half-configured Agent，其他 Principal 也不能抢占 id。

`resume()` 在 `ctx.agents.resume()` 之前完成 `assertSessionAccess()`。

## DSH MCP namespace

Pinned 官方 MCP client 在一个 Cordis root 内 reserve `serverName`，而通过 `agent.ctx` 注册的 ToolRuntime tool 是 Agent-scoped。Integration 会从 logical server name + Tenant + Principal + Session 派生 deterministic physical namespace。

## Publication boundary

Initial MCP connect + `tools/list` 在 DSH Agent setup 内完成，startup failure 作为 fatal。`create()` / `resume()` resolve 时 Agent 已拥有 initial native MCP tool set。

## Required executable evidence

`scripts/mcp-agent-integration-probe.mjs` 在两条 Node line 上证明真实 stdio MCP startup、官方 `tools/list`、真实 `ctx.tools.execute()` -> MCP wire、Tenant / Principal 并发隔离、Agent-scoped tool visibility、cross-Principal resume 在 DSH 前拒绝、同 Session namespace 稳定、startup failure 与 teardown。

## Non-goals

- MCP Resources / Prompts bridge；
- 平行 MCP protocol implementation；
- public universal Credential Broker；
- ERP abstraction/package；
- hostile same-process code isolation。
