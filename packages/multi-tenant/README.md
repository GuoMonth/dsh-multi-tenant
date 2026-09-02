[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

`dsh-multi-tenant@0.4.0-alpha.1` is a DSH multi-tenant plugin for Node 22.19+ and Node 24. It is pinned to `@deepseek-ai/*@0.1.2-alpha.4`.

## Install

```bash
pnpm add dsh-multi-tenant@0.4.0-alpha.1
```

Load the plugin after the DSH `agents` and `tools` services. With no host replacements it uses `.dsh-multi-tenant/agents.sqlite`, an empty MCP declaration, and DSH's shared in-process runtime:

```ts
import * as MultiTenant from 'dsh-multi-tenant'

await ctx.plugin(MultiTenant, {
  minimumIsolation: 'logical',
})
```

Set `DSH_MULTI_TENANT_DB_PATH` or `sqlite.path` to change the SQLite file. Existing `0.3` ownership data is deliberately ignored.

## Minimal API

The host authenticates first, then mints a `PrincipalContext`. Request JSON is never a Principal.

```ts
import { createPrincipalContext } from 'dsh-multi-tenant'

const principal = createPrincipalContext({
  tenantId: authenticated.tenantId,
  principalId: authenticated.subjectId,
})

const agent = await ctx.multiTenant.create(principal)

const result = await ctx.multiTenant.withAgent(principal, agent.id, runtime =>
  runtime.executeTool('mcp__erp__find_customer', { customerId: 'C-42' }),
)

await ctx.multiTenant.delete(principal, agent.id)
```

`create()` generates both the public `AgentId` and a separate internal DSH session id. `get`, `list`, `withAgent`, and `delete` scope every lookup by Agent, Tenant, and Principal. Unknown, foreign, failed, and deleted resources all appear as `AgentNotFoundError`.

`withAgent()` is the only trusted execution entry. Its callback receives `followup`, `steer`, `inject`, `cancel`, `whenIdle`, and `executeTool`; it cannot obtain a DSH session id, Agent handle, Cordis context, or disposer.

## Real MCP configuration

Register host providers before the root plugin. The official `dsh-mcp-client` is loaded inside each unpublished Agent setup, so two Agents may use the same logical `serverName` without hashing it:

```ts
import {
  StaticSecretProvider,
  StaticTenantMcpProvider,
} from 'dsh-multi-tenant'

await ctx.plugin(StaticTenantMcpProvider, {
  revision: 'erp-v1',
  servers: [{
    transport: 'stdio',
    serverName: 'erp',
    command: process.execPath,
    args: ['/opt/my-erp-mcp/server.mjs'],
    secretEnv: {
      API_TOKEN: { secret: 'erp-token', prefix: 'Bearer ' },
    },
  }],
})
await ctx.plugin(StaticSecretProvider, {
  revision: 'dev-secrets-v1',
  values: { 'erp-token': process.env.ERP_TOKEN! },
})
await ctx.plugin(MultiTenant)
```

The static providers are development conveniences. Production hosts normally implement `TenantMcpProvider` and `SecretProvider`; a `SecretLease` keeps values in memory and supplies a revision, revocation signal, and disposer. Revocation cancels and disposes the live Agent. The next authorized use acquires a new lease and resumes the same internal session.

## Web adapter

`dsh-multi-tenant/web` mounts authenticated CRUD through the existing DSH `ctx.webServer.register()` seam:

```ts
import { mountMultiTenantWeb } from 'dsh-multi-tenant/web'

mountMultiTenantWeb(ctx, ctx.multiTenant, {
  principalProvider: {
    async authenticate(request) {
      const identity = await authenticateProductRequest(request)
      return identity && createPrincipalContext(identity)
    },
  },
})
```

Routes are `POST/GET /_dsh-multi-tenant/agents` and `GET/DELETE /_dsh-multi-tenant/agents/:id`. Bodies cannot set Tenant, Principal, Agent, or session identity. Responses use 401, 400, 404, 503, and 502 for authentication, input, hidden resource, unavailable capability/isolation, and DSH provisioning failure respectively.

## Guarantees and boundaries

- SQLite records use CAS revisions and Principal-scoped SQL. Delete revokes access first and retains only a scrubbed tombstone.
- Provisioning is unpublished until DSH setup and the database ready transition both succeed.
- Per-Agent create/resume/refresh/delete is serialized; concurrent opens single-flight; plugin shutdown cancels and drains every owned handle.
- A configured `strong` minimum fails closed before DSH Agent creation when the provider offers only `logical` isolation.
- `TenantAgentRepository`, `TenantMcpProvider`, `SecretProvider`, `RuntimePartitionProvider`, and `DshRuntimeDriver` are the host replacement protocols. They compose through Cordis services; there is no second DI system.
- The bundled shared provider is process-local logical separation. It does not isolate hostile plugins, tools, filesystem access, subprocesses, memory, or network traffic.
- SQLite is a local/single-node default, not a multi-replica database claim. Replace `TenantAgentRepository` when the deployment requires that property.
- Delete does not claim physical erasure of DSH persistent logs.
- No Typert public adapter is shipped because stock Typert does not establish a trusted Principal binding. Keep stock DSH `/api` private/administrative.

Public subpaths are exactly `/mcp`, `/sqlite`, `/web`, `/testing`, and `/starter`.
