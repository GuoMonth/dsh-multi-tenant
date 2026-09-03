[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

`dsh-multi-tenant@0.4.0-alpha.3` is a DSH multi-tenant plugin for Node 22.19+ and Node 24. It is pinned to `@deepseek-ai/*@0.1.2-rc.1` at upstream commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`.

This alpha is for host integration and contract feedback. It provides a compact authority path from a server-minted Principal to an owned DSH Agent, durable local directory, and Agent-scoped MCP lifecycle. It assumes the host already provides trustworthy authentication and owns any isolation stronger than the bundled logical boundary.

## Install

When the npm distribution is available, use the alpha channel or pin the reviewed build exactly:

```bash
pnpm add dsh-multi-tenant@alpha
# or pin the reviewed prerelease exactly
pnpm add dsh-multi-tenant@0.4.0-alpha.3
```

The `alpha` channel may introduce source-breaking provider contract changes before `0.4.0`. Use the exact version when reproducible deployments matter. The matching source tag is `v0.4.0-alpha.3`; publishing the npm artifact and GitHub prerelease are separate explicit release operations.

DSH RC.1 changes only release metadata relative to alpha.5, but alpha.3 intentionally supports RC.1 alone. All direct DSH peers and development dependencies are exact so an unreviewed Harness build cannot silently enter the runtime graph.

Load the plugin after the DSH `agents` and `tools` services. With no host replacements it uses `.dsh-multi-tenant/agents.sqlite`, an empty MCP declaration, and DSH's shared in-process runtime:

```ts
import * as MultiTenant from 'dsh-multi-tenant'

await ctx.plugin(MultiTenant, {
  minimumIsolation: 'logical',
})
```

On Unix, the default directory is enforced as `0700` and its database as `0600`, including when they already exist; inability to enforce either mode fails startup. Set `DSH_MULTI_TENANT_DB_PATH` or `sqlite.path` to use a host-managed path. The plugin does not chmod a configured path or its parent: its ACL, backups, and encryption are the host's responsibility. Windows deployments must apply an equivalent host ACL. Existing `0.3` ownership data and unpublished candidate schemas are deliberately not migrated.

Opening the built-in SQLite repository atomically changes every abandoned `provisioning` record to terminal `failed` before the service is installed, completing [#49](https://github.com/GuoMonth/dsh-multi-tenant/issues/49). Such resources stay product-level not-found and are never resumed; a retry receives fresh Agent and session identities. This assumes the host guarantees one active process for the database.

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

Each runtime view is callback-scoped. It expires when the callback resolves or rejects, and also on delete, capability revocation/refresh, and service shutdown. Retained views reject every operation with `CapabilityUnavailableError`.

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

Host provider acquisition receives a required lifecycle signal, completing [#50](https://github.com/GuoMonth/dsh-multi-tenant/issues/50). MCP and Secret providers receive the service signal; runtime partitions and DSH drivers receive its combination with SecretLease revocation:

```ts
load(principal, signal: AbortSignal): Promise<TenantMcpSnapshot>
acquire(principal, names, signal: AbortSignal): Promise<SecretLease>
acquire({ principal, agentId, requiredIsolation, signal }): Promise<RuntimePartitionLease>
```

Providers should check the signal before work, stop promptly when practical, return stable revisions, and make disposal idempotent. The plugin validates and freezes their returned capability view before DSH work. Abort remains cooperative; it cannot forcibly terminate arbitrary host code.

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
  resolveAgentProfile(principal, profile) {
    if (profile === 'coding') {
      return {
        agentOptions: { provider: 'trusted-provider', model: 'trusted-coder' },
        meta: { cwd: trustedWorkspaceFor(principal) },
      }
    }
  },
})
```

Routes are `POST/GET /_dsh-multi-tenant/agents` and `GET/DELETE /_dsh-multi-tenant/agents/:id`. A create body is exactly `{}` for host defaults or `{ "profile": "coding" }`; the authenticated host resolver is the only place a name can become trusted DSH options. Identity, session, raw Agent options, metadata, and unknown fields are rejected. Responses use 401, 400, 404, 503, and 502 for authentication, input, hidden resource, unavailable capability/isolation, and DSH provisioning failure respectively.

## Guarantees and boundaries

- SQLite records use CAS revisions and Principal-scoped SQL. An authorized delete immediately invalidates active callback views and reserves a serialized barrier; later `withAgent()` calls cannot overtake it and see only not-found after the scrubbed tombstone is committed.
- Provisioning is unpublished until DSH setup and the database ready transition both succeed.
- Per-Agent create/resume/refresh/delete is serialized; concurrent opens single-flight; plugin shutdown cancels and drains every owned handle.
- The alpha.2 lifecycle contract, retained in alpha.3, propagates abort through MCP, Secret, RuntimePartition, and DSH setup and validates provider results before use. Drain remains cooperative: code that ignores abort or never settles can delay delete or shutdown indefinitely; forced interruption and arbitrary default timeouts are out of scope.
- A configured `strong` minimum fails closed before DSH Agent creation when the provider offers only `logical` isolation.
- `TenantAgentRepository`, `TenantMcpProvider`, `SecretProvider`, `RuntimePartitionProvider`, and `DshRuntimeDriver` are the host replacement protocols. They compose through Cordis services; there is no second DI system.
- The bundled shared provider is process-local logical separation. It does not isolate hostile plugins, tools, filesystem access, subprocesses, memory, or network traffic.
- SQLite is a local, single-node, single-active-process default. The host deployment must maintain that invariant; the plugin does not enforce it with locks, heartbeats, or fencing. Startup deterministically fails abandoned provisioning before Agent operations. A custom `TenantAgentRepository` must complete the recovery required by its own topology before registration; replace it when deployment requires multi-process coordination or a different persistence boundary.
- Delete does not claim physical erasure of DSH persistent logs.
- No Typert public adapter is shipped because stock Typert does not establish a trusted Principal binding. Keep stock DSH `/api` private/administrative.

Public code/API subpaths are exactly `/mcp`, `/sqlite`, `/web`, `/testing`, and `/starter`. `./cordis.patch.yml` is additionally exported as a DSH loader configuration artifact, not a JavaScript API.
