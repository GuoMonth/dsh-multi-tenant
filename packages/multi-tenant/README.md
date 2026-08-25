# dsh-multi-tenant

**Run DeepSeek Harness safely behind a multi-tenant SaaS product.**

Use this package when one DSH runtime must serve many organizations and users without mixing Tenant configuration, Principal credentials, Session ownership or Agent-scoped MCP Tools.

> **`dsh-multi-tenant@0.3.0-rc.3` — Durable Local Experience**
>
> Compatible DSH baseline: `0.1.1-rc.2`.

## The problem

A single-user Agent can look like:

```text
request -> Agent -> MCP -> backend
```

A SaaS runtime has to keep this safe instead:

```text
Acme / Alice   -> Acme MCP + Alice credential + Alice Sessions
Acme / Bob     -> Acme MCP + Bob credential   + Bob Sessions
Globex / Alice -> Globex MCP + Globex/Alice credential + Globex Sessions
```

`dsh-multi-tenant` turns the repeated glue into one product path:

```text
already-authenticated product subject
  -> Tenant / Principal
  -> Tenant MCP config
  -> Principal credentials
  -> fail-closed Session ownership
  -> Principal-aware Agent create/resume
  -> native DSH MCP Tools
```

Authentication stays product-owned. The framework starts after your JWT, Cookie, OIDC session, API key or other login mechanism has already produced a trusted user/subject.

## Install

Inside a compatible DSH profile:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

Or from framework code that already owns the compatible DSH installation:

```sh
pnpm add dsh-multi-tenant
```

The MCP path reuses the official `@deepseek-ai/dsh-mcp-client` supplied by DSH. This package does not vendor or fork MCP.

## Durable local ownership

A normal DSH plugin install now uses the package's SQLite provider by default. It is backed by Node's built-in `node:sqlite`, so individual developers do not need PostgreSQL, Docker, a native addon or another database dependency just to prove restart-safe Session ownership.

```text
Alice claims Session s1
        ↓
<cwd>/.dsh-multi-tenant/session-ownership.sqlite
        ↓ restart DSH / Node
Alice -> s1          allowed
Bob   -> s1          denied
Globex/Alice -> s1   denied
```

Override the path with `DSH_MULTI_TENANT_SQLITE_PATH`, or mount the provider directly:

```ts
import SQLiteTenantSessionStore from 'dsh-multi-tenant/sqlite-store'

await ctx.plugin(SQLiteTenantSessionStore, {
  path: './state/session-ownership.sqlite',
})
```

SQLite is the **local durable / single-node adoption provider**, not a horizontally scaled production database claim. `InMemoryTenantSessionStore` remains available for hermetic tests. Future PostgreSQL/other providers should implement the same `TenantSessionStore` contract.

## First Product Experience

Before integrating your own product, run the opt-in starter on the real shipped DSH Web profile:

```sh
dsh plugin --profile web add dsh-multi-tenant
DSH_MULTI_TENANT_STARTER=1 dsh web
```

Open the printed DSH URL plus `/_dsh-multi-tenant`.

The starter is dormant by default and gives you three identities:

```text
Acme / Alice
Acme / Bob
Globex / Alice
```

It uses a real DSH Agent, the official DSH MCP client and a real stdio MCP JSON-RPC Tool. You can observe:

- Acme/Alice resolving to the correct Tenant / Principal;
- real MCP `tools/list` + `tools/call`;
- Principal credential propagation proven as `credentialAccepted: true` without returning the raw credential;
- owner Session resume;
- Acme/Bob denied Alice's Session;
- a second Tenant through Globex/Alice.

The starter panel is mounted beside the existing DSH Web app on the same `ctx.webServer`; it is not another chat frontend or another HTTP server.

## Quick start

`createMcpSaaSRuntime()` is the opinionated MCP-specific product facade over the existing Core:

```ts
import { createMcpSaaSRuntime } from 'dsh-multi-tenant'

const app = await createMcpSaaSRuntime(ctx, {
  identity(subject: TrustedSubject) {
    return {
      tenantId: subject.organizationId,
      userId: subject.userId,
    }
  },
  mcp: {
    load({ tenantId }) {
      return {
        servers: [{
          transport: 'streamable-http',
          serverName: 'erp',
          url: endpointForTenant(tenantId),
          credentialHeaders: {
            Authorization: { credential: 'erpToken', prefix: 'Bearer ' },
          },
        }],
      }
    },
  },
  credentials: {
    create({ principal }) {
      return loadPrincipalCredentials(principal)
    },
  },
})

const principal = await app.resolve(trustedSubject)
const handle = await principal.create({ sessionId })
```

The facade composes the existing `CompositionPlan`, `RuntimeComposition`, Product Ingress and `createMcpAgentIntegration()` primitives. It is not a second Runtime or DI system.

When `create()` resolves, the official MCP client has completed initial connection, `tools/list` synchronization and Tool registration. `resume()` checks Session ownership before DSH persistence/setup runs.

### Existing JWT / Cookie / req.user

The Web bridge consumes the result of your existing authentication stack:

```ts
import {
  mountMcpSaaSWebBridge,
  readBearerToken,
  readCookie,
} from 'dsh-multi-tenant'

mountMcpSaaSWebBridge(ctx, app, {
  async authenticate(req) {
    const jwt = readBearerToken(req.headers)
    if (jwt) return verifyExistingJwt(jwt)

    const sessionId = readCookie(req.headers, 'product_session')
    if (sessionId) return lookupExistingServerSession(sessionId)

    return undefined
  },
})
```

`readBearerToken()` and `readCookie()` are transport extractors, not authentication. JWT verification, OIDC, server-session validation, refresh and user lookup stay in the product.

## What 0.3 provides

- canonical Tenant / Principal resolution from trusted product identity;
- exact `CompositionPlan -> RuntimeComposition` binding;
- Principal-scoped replaceable credentials;
- Tenant-scoped MCP configuration;
- Principal-bound Agent `create()` / `resume()`;
- immutable, fail-closed Session ownership;
- zero-external-service SQLite ownership persistence across local restarts;
- deterministic per-Session MCP namespaces;
- Principal-owned long-lived Agents;
- official DSH MCP Tools integration;
- MCP-specific product facade;
- same-server DSH Web identity/admission bridge;
- structured secret-safe first-use diagnostics;
- opt-in real-DSH-Web starter;
- permanent executable FPE + durable-local evidence;
- clean installed-artifact and post-publication registry verification.

## Architecture

```text
Product authentication
  -> trusted subject
  -> Product Web bridge / Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal credentials
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> official @deepseek-ai/dsh-mcp-client
  -> native Agent-scoped MCP Tools
```

The responsibility split stays small:

- Product owns authentication.
- Core owns identity, composition and lifecycle.
- Integration owns downstream protocol/configuration.
- Principal owns long-lived Agents.
- DSH owns MCP wire behavior and Tool discovery.

## Diagnostics

Product-facing errors expose stable layers without serializing arbitrary underlying auth/vendor/credential errors:

```json
{
  "code": "SESSION_ACCESS_DENIED",
  "stage": "session-ownership",
  "message": "This Session belongs to another Principal."
}
```

The pinned official MCP client reports initial connect/discovery/register as one activation failure, so the package does not guess a finer failure stage that upstream cannot prove.

## Security boundary

Cordis Context provides trusted same-process identity/lifecycle separation, not hostile-code isolation. Strong secret/process/filesystem/network isolation belongs to process/container/Pod/sidecar/remote boundaries.

The pinned DSH Web carrier also does not currently materialize a product-authenticated Principal Context for every stock Web RPC business method. rc.3 guarantees product-aware identity + Agent create/resume admission + Session ownership; it does not claim that every stock DSH Web RPC becomes tenant-authorized automatically. This boundary is tracked in #41.

For production Web exposure, keep DSH Web private behind a Product Gateway/BFF that authenticates the request, resolves the same canonical Tenant/Principal, and authorizes protected Session/Agent resources before forwarding. Public clients must not be able to bypass the gateway and reach stock DSH `/api` directly.

SQLite is similarly scoped: it gives individual developers and single-node deployments durable ownership across restart, not multi-replica production persistence.

The starter's demo cookie is not a production authentication mechanism.

## Compatibility

- Node: `^22.19.0 || >=24.0.0`
- Cordis: `>=4.0.1 <5`
- DSH: `0.1.1-rc.2`

`pnpm release:check` includes both the real-Web First Product Experience proof and the separate-process SQLite restart/competition proof before publication.

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
dsh-multi-tenant/product
dsh-multi-tenant/web
dsh-multi-tenant/diagnostics
dsh-multi-tenant/starter
dsh-multi-tenant/store
dsh-multi-tenant/sqlite-store
dsh-multi-tenant/testing
```