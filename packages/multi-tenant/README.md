[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

`dsh-multi-tenant@0.6.0` is a DSH multi-tenant plugin for Node 22.19+ and Node 24, pinned to DSH `0.1.5-rc.2` at source commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`.

The Principal API and SQLite Directory schema carry forward from `0.4.0`; the required DSH baseline changes. Only the exact target is supported, without a multi-version compatibility layer. The host owns authentication and any isolation stronger than the bundled logical boundary.

## Install

The release identity is `v0.6.0`, using npm's `latest` dist-tag. Pin the plugin and its exact DSH peers together:

```bash
pnpm add dsh-multi-tenant@0.6.0 @deepseek-ai/cordis@4.0.2 \
  @deepseek-ai/dsh-agent@0.1.5-rc.2 @deepseek-ai/dsh-llm@0.1.5-rc.2 \
  @deepseek-ai/dsh-mcp-client@0.1.5-rc.2 @deepseek-ai/dsh-session@0.1.5-rc.2 \
  @deepseek-ai/dsh-tools@0.1.5-rc.2
```

DSH remains pre-stable. Upgrade the host's entire DSH dependency graph together. Its supported historical logs may migrate to V3; the plugin does not implement data migration. Stop the host and back up its Directory and DSH data before upgrading. Rollback requires the corresponding old runtime and pre-upgrade data together: old retained logs do not contain V3 additions.

Load the plugin after the DSH `agents`, `tools`, and `sessions` services, with a persistence backend such as JSONL mounted before creating Agents. With no host replacements it uses `.dsh-multi-tenant/agents.sqlite`, an empty MCP declaration, and DSH's shared in-process runtime:

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

await ctx.multiTenant.send(principal, agent.id, 'Hello', { delivery: 'queue' })
await ctx.multiTenant.cancel(principal, agent.id)
const result = await ctx.multiTenant.executeTool(
  principal, agent.id, 'mcp__erp__find_customer', { customerId: 'C-42' },
)

await ctx.multiTenant.delete(principal, agent.id)
```

`create()` on the shared driver checkpoints the new DSH session before the Directory becomes ready, including when there are no messages. Missing or failing durability listeners reject creation and dispose the acquired Agent. Custom persistent runtime drivers must also establish their durability boundary before returning success.





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

- Provisioning is unpublished until DSH setup, the shared driver session checkpoint, and the database ready transition all succeed.
- Per-Agent create/resume/refresh/delete is serialized; concurrent opens single-flight; plugin shutdown cancels and drains every owned handle.
- The lifecycle contract propagates abort through MCP, Secret, RuntimePartition, and DSH setup and validates provider results before use. Drain remains cooperative: code that ignores abort or never settles can delay delete or shutdown indefinitely; forced interruption and arbitrary default timeouts are out of scope.
- A configured `strong` minimum fails closed before DSH Agent creation when the provider offers only `logical` isolation.
- `TenantAgentRepository`, `TenantMcpProvider`, `SecretProvider`, `RuntimePartitionProvider`, and `DshRuntimeDriver` are the host replacement protocols. They compose through Cordis services; there is no second DI system.
- The bundled shared provider is process-local logical separation. It does not isolate hostile plugins, tools, filesystem access, subprocesses, memory, or network traffic.
- SQLite is a local, single-node, single-active-process default. The host deployment must maintain that invariant; the plugin does not enforce it with locks, heartbeats, or fencing. Startup deterministically fails abandoned provisioning before Agent operations. A custom `TenantAgentRepository` must complete the recovery required by its own topology before registration; replace it when deployment requires multi-process coordination or a different persistence boundary.
- Delete does not claim physical erasure of DSH persistent logs.
- No Typert public adapter is shipped because stock Typert does not establish a trusted Principal binding. Keep stock DSH `/api` private/administrative.

Public code/API subpaths are exactly `/mcp`, `/sqlite`, `/web`, `/testing`, and `/starter`. `./cordis.patch.yml` is additionally exported as a DSH loader configuration artifact, not a JavaScript API.

## Runtime commands

`send(principal, id, text, { delivery: 'queue' | 'steer' })` returns `{ accepted: true }` after native input admission, without waiting for the model. This is not a durability receipt. `cancel()` targets only the current live generation and returns `cancelled` or `inactive`; it does not resume cold Agents. `whenIdle()` waits for current activity without activating a cold resource. `executeTool()` and `inject()` are trusted-host methods.

The callback API has been removed. Long tool operations and idle waits do not hold the lifecycle queue. Delete, refresh, revocation and shutdown close the generation, cancel admitted work and drain before releasing the handle and provider leases. A failed durable delete stays closed to new commands until the owner retries deletion in this process.

Web adds `POST /_dsh-multi-tenant/agents/:id/messages` with `{ text, delivery? }` and `POST .../:id/cancel` with `{ reason? }`. Message source is host-established. There is no arbitrary Web tool execution endpoint.
