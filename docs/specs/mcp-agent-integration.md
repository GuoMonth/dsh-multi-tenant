[简体中文](./mcp-agent-integration.zh-CN.md) | English

# Spec — DSH-native MCP Agent Integration

> Status: implemented `0.3` contract.

## User outcome

A product developer provides product-owned identity resolution, per-Tenant MCP configuration and per-Principal credentials, then creates/resumes a DSH Agent through one Principal-bound integration surface.

```text
trusted product request
  -> Product Ingress
  -> RuntimeComposition
  -> canonical Principal
  -> TenantMcpConfig + PrincipalCredentials
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> Agent setup
  -> official @deepseek-ai/dsh-mcp-client
  -> initial tools/list before Agent publication
  -> native Agent-scoped MCP Tools
```

The product does not manually construct an MCP SDK client, manually wire DSH `ownerCtx`, or copy credentials into Agent/application code merely to mount a server.

## Runtime capability

`tenantMcpConfig` is Tenant-owned. The current integration supports `stdio` and `streamable-http`. Static transport configuration belongs to the Tenant; credential bindings reference Principal-scoped `PrincipalCredentials` and resolve only during Agent setup.

## Agent lifecycle

The create/resume request is a one-shot Principal Operation because capability acquisition and authorization must execute once. The live DSH Agent is created through the canonical Principal Context, not owned by that short Operation Fiber.

## Session ownership

`create()` claims Session ownership before DSH Agent creation. The claim is a durable reservation: setup failure cannot publish a half-configured Agent and another Principal cannot steal the id.

`resume()` completes `assertSessionAccess()` before `ctx.agents.resume()` is invoked.

## DSH MCP namespace

The pinned official MCP client reserves `serverName` across one Cordis root, while ToolRuntime registrations made from `agent.ctx` are Agent-scoped. The integration derives a deterministic physical namespace from logical server name + Tenant + Principal + Session.

## Publication boundary

Initial MCP connect + `tools/list` completes during DSH Agent setup with startup failure treated as fatal. `create()` / `resume()` therefore resolve only after the Agent owns its initial native MCP tool set.

## Required executable evidence

`scripts/mcp-agent-integration-probe.mjs` proves real stdio MCP startup, official `tools/list`, real `ctx.tools.execute()` -> MCP wire execution, concurrent Tenant/Principal isolation, Agent-scoped tool visibility, pre-DSH cross-Principal resume denial, stable same-Session namespace, startup failure behavior and teardown on both supported Node lines.

## Non-goals

- MCP Resources or Prompts bridging;
- a parallel MCP protocol implementation;
- a public universal Credential Broker;
- ERP abstraction/package design;
- hostile same-process code isolation.
