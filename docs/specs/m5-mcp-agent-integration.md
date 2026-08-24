[简体中文](./m5-mcp-agent-integration.zh-CN.md) | English

# Spec — M5 DSH-native MCP Agent Integration

> Status: implementation contract for v0.3 M5. This Spec becomes complete only when the executable M5 probe and package/release gates are green.

## User outcome

M5 is complete when a product developer can provide only product-owned identity resolution, per-Tenant MCP configuration and per-Principal credentials, then create/resume a DSH Agent through one Principal-bound integration surface.

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
  -> native agent-scoped MCP Tools
```

The product does not manually construct an MCP SDK client, manually wire DSH `ownerCtx`, or copy credentials into Agent/application code merely to mount a server.

## Runtime capabilities

M5 adds one real Tenant-owned capability:

```ts
CapabilityToken<TenantMcpConfig, 'tenant'>
```

`TenantMcpConfig` describes logical MCP servers. M5 supports the two transports exposed by the pinned official DSH MCP client:

- `stdio`;
- `streamable-http`.

Static transport configuration belongs to the Tenant. Credential bindings reference names from the existing Principal-scoped `PrincipalCredentials` capability and are resolved only during Agent setup.

Examples:

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

M5 deliberately does not define a universal Broker API. `PrincipalCredentials` is still the current low-level primitive; the integration keeps raw values inside trusted setup plumbing rather than returning them from the product Operation.

## Agent lifecycle

The create/resume request is a one-shot Principal Operation because capability acquisition and authorization must execute exactly once.

The live DSH Agent is **not** owned by that short Operation Fiber. It is created through the canonical Principal Context:

```text
Principal
  ├─ Operation(create/resume)   short-lived decision/snapshot
  └─ DSH Agent                  long-lived, Principal-owned
       └─ Agent-scoped MCP plugin(s)
```

This lets the Agent survive after the create/resume call returns while preserving deterministic Principal teardown.

## Session ownership

### Create

`claimSession(sessionId, principal)` runs before DSH Agent creation.

The v0 ownership store intentionally has no delete/release. Therefore the claim is a durable **reservation**, not a rollback-capable transaction. If MCP/Agent setup later fails:

- no partially configured Agent may publish;
- the session id remains reserved to the same Principal;
- the same Principal may retry;
- another Principal can never steal the id.

### Resume

`assertSessionAccess(principal, sessionId)` must complete before `ctx.agents.resume()` is invoked. A denied caller therefore cannot trigger DSH persistence load or Agent setup for another Principal's Session.

## DSH MCP namespace

The pinned `@deepseek-ai/dsh-mcp-client` reserves `serverName` across one Cordis root, while DSH ToolRuntime registrations made from `agent.ctx` are Agent-scoped.

M5 derives a deterministic physical server namespace from:

```text
logical serverName + tenantId + userId + sessionId
```

The result:

- is valid under the official MCP client's 32-character server-name contract;
- is stable for the same Principal Session across resume;
- normally separates concurrent Agent instances that use the same logical product server name;
- is exposed on the returned `McpAgentHandle` for diagnostics/tool-prefix discovery.

The official MCP client remains the final collision authority and fails loudly on a collision.

## Publication boundary

Every configured server is mounted with startup failure treated as fatal. Initial MCP connect + `tools/list` must complete during the DSH Agent `setup` boundary.

Therefore `create()` / `resume()` resolve only after the Agent has its initial native MCP tool set, and setup failure rolls the unpublished Agent scope back.

## Tool scope

MCP tools are registered from `agent.ctx`. They must be visible to that Agent's DSH scope and absent from the unscoped/global ToolRuntime view.

M5 does not copy a Tenant/Principal isolation map into DSH internals and does not create a second tool registry.

## Required executable evidence

`scripts/m5-mcp-agent-integration-probe.mjs` must prove on the exact pinned public DSH packages and on both supported Node lines:

1. DSH scopes share the app Cordis root and the official MCP client enforces root-wide `serverName` reservation;
2. a real stdio MCP server starts through the official client;
3. real `tools/list` registers native DSH tools;
4. a tool executes through `ctx.tools.execute()` and crosses the real MCP wire path;
5. Acme/Alice, Acme/Bob and Globex/Alice run concurrently with distinct Tenant config / Principal credential observations;
6. those MCP tools are Agent-scoped, not globally visible;
7. cross-Principal resume is denied before the DSH Agent factory is called;
8. same-Principal resume keeps a stable runtime namespace;
9. failed MCP startup leaves no live Agent while keeping the fail-closed Session reservation;
10. Agent/Principal teardown removes MCP tools/connections.

## Non-goals

- MCP Resources or Prompts bridging;
- a parallel MCP protocol implementation;
- a public universal Credential Broker;
- ERP abstraction/package design;
- hostile same-process code isolation;
- v0.3 version bump/publication in M5 itself.
