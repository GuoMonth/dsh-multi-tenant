[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

**Turn DeepSeek Harness into a multi-tenant SaaS Agent runtime.**

If one DSH runtime must safely serve many organizations and users, this project owns the layer that usually becomes dangerous first: **which Tenant/Principal owns the request, which credentials and MCP config they may use, which Session they may resume, and which long-lived Agent lifecycle belongs to them.**

> Current release candidate: **`dsh-multi-tenant@0.3.0-rc.3` — Durable Local Experience**
>
> Compatible DSH baseline: `0.1.1-rc.2` at `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.

## The SaaS problem

```text
Acme / Alice   -> Acme ERP MCP + Alice credential + Alice Sessions
Acme / Bob     -> Acme ERP MCP + Bob credential   + Bob Sessions
Globex / Alice -> Globex ERP MCP + Globex/Alice credential + Globex Sessions
```

`dsh-multi-tenant` turns that into one reusable path:

```text
already-authenticated product subject
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal credentials
  -> fail-closed Session ownership
  -> Principal-aware Agent create/resume
  -> native DSH Agent + MCP Tools
```

Product authentication remains product-owned. JWT, Cookie, OIDC, server session or other login mechanisms are verified before this runtime receives a trusted subject.

## See the value first

Install into the real shipped DSH Web profile and explicitly opt into the starter:

```sh
dsh plugin --profile web add dsh-multi-tenant
DSH_MULTI_TENANT_STARTER=1 dsh web
```

Open the printed DSH URL plus `/_dsh-multi-tenant`.

The starter is dormant by default. It lets you switch between:

```text
Acme / Alice
Acme / Bob
Globex / Alice
```

and prove, using a real DSH Agent + official MCP client + real stdio MCP Tool:

- canonical Tenant / Principal identity;
- real `tools/list` + `tools/call`;
- Principal credential propagation without returning the raw credential;
- owner Session resume;
- cross-Principal Session denial;
- second-Tenant isolation.

The starter panel is mounted beside the existing DSH Web app on the same `ctx.webServer`; it is not another chat frontend or HTTP server.

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

Or from framework code that already owns a compatible DSH installation:

```sh
pnpm add dsh-multi-tenant
```

The MCP path reuses the official `@deepseek-ai/dsh-mcp-client` supplied by DSH instead of vendoring or forking MCP.

## Durable local ownership by default

A normal DSH plugin install now uses the built-in SQLite Session ownership provider. There is no PostgreSQL container, native addon or extra npm database dependency to configure before the first durable test.

```text
Alice claims Session s1
        ↓
<cwd>/.dsh-multi-tenant/session-ownership.sqlite
        ↓ restart DSH / Node
Alice -> s1  allowed
Bob   -> s1  denied
Globex/Alice -> s1 denied
```

Override the database location when needed:

```sh
DSH_MULTI_TENANT_SQLITE_PATH=/path/to/session-ownership.sqlite dsh web
```

Framework code can mount the same provider directly:

```ts
import SQLiteTenantSessionStore from 'dsh-multi-tenant/sqlite-store'

await ctx.plugin(SQLiteTenantSessionStore, {
  path: './state/session-ownership.sqlite',
})
```

SQLite is the **local durable / single-node adoption provider**. `InMemoryTenantSessionStore` remains available for hermetic tests. A future PostgreSQL or other multi-instance provider should implement the same `TenantSessionStore` contract rather than changing Core ownership semantics.

## Minimal product flow

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
      return loadCredentialsFor(principal)
    },
  },
})

const principal = await app.resolve(trustedSubject)
const handle = await principal.create({ sessionId })
```

`createMcpSaaSRuntime()` is deliberately a thin MCP-specific facade over the existing `CompositionPlan -> RuntimeComposition -> ProductIngress -> createMcpAgentIntegration()` path. Advanced consumers can still use the Core primitives directly.

### Existing JWT / Cookie / req.user

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

The helpers only extract transport values. Authentication/verification remains in the product.

## What 0.3 gives you

- trusted product subject -> canonical Tenant / Principal;
- exact `CompositionPlan -> RuntimeComposition` binding;
- Principal-scoped replaceable credentials;
- Tenant-scoped MCP configuration;
- Principal-bound Agent `create()` / `resume()`;
- immutable, fail-closed Session ownership;
- zero-external-service SQLite ownership persistence across local restarts;
- deterministic per-Session MCP namespaces;
- Principal-owned long-lived Agents;
- official DSH MCP Tools integration;
- MCP-specific product facade + same-server Web identity/admission bridge;
- secret-safe structured diagnostics;
- opt-in real-DSH-Web starter;
- permanent First Product Experience and durable-local executable evidence;
- installed-artifact and post-publication registry verification.

## Architecture

```text
Product authentication
        ↓ trusted subject
Product Web bridge / Product Ingress
        ↓
RuntimeComposition
        ↓
canonical Tenant / Principal
        ↓
Tenant MCP config + Principal credentials
        ↓
one-shot create/resume Operation
        ↓
Principal-owned DSH Agent
        ↓
official @deepseek-ai/dsh-mcp-client
        ↓
native Agent-scoped MCP Tools
```

The responsibility split is intentionally small: Product owns authentication; Core owns identity/composition/lifecycle; Integration owns downstream protocol/configuration; Principal owns long-lived Agents; DSH owns MCP wire behavior.

## Honest boundaries

Pinned DSH Web does not currently materialize a product-authenticated Principal Context for every stock Web RPC business method. rc.3 guarantees product-aware identity + Agent create/resume admission + Session ownership, but it does **not** claim that every stock DSH Web RPC becomes tenant-authorized automatically. This is the acknowledged boundary tracked in [#41](https://github.com/GuoMonth/dsh-multi-tenant/issues/41).

For production Web exposure until DSH provides a request-scoped Principal seam, treat DSH Web as a **private backend**:

```text
Browser / external client
        ↓
Product Gateway / BFF
  - authenticate
  - resolve Tenant / Principal
  - authorize Session / Agent resources
        ↓ private network / loopback
DSH Web + dsh-multi-tenant
```

The public client must not be able to bypass that gateway and reach stock DSH `/api` directly. This is the recommended production authority boundary, not a workaround hidden inside the SQLite store.

SQLite also does not claim horizontally scaled multi-instance production durability. It is intentionally optimized for individual developers and single-node validation. Cordis Context is not hostile-code isolation either; strong process/filesystem/network isolation belongs to process/container/Pod/sidecar/remote boundaries.

## Evidence and release

`pnpm release:check` gates publication on both the real-Web First Product Experience and the durable-local SQLite proof, in addition to typecheck/tests/build, packed artifact smoke and the existing DSH/Cordis/MCP probes.

`pnpm probe:sqlite` launches separate Node processes against one SQLite file and proves restart persistence, sibling-Principal denial, cross-Tenant denial and exactly-one-winner competing claims.

See:

- [Direction](./DIRECTION.md)
- [Architecture](./docs/specs/architecture.md)
- [Product Ingress + Credentials](./docs/specs/product-ingress-credentials.md)
- [MCP Agent Integration](./docs/specs/mcp-agent-integration.md)
- [Compatibility](./docs/reference/compatibility.md)
- [Release contract](./docs/reference/release.md)
- [0.3.0-rc.3 release note](./docs/releases/v0.3.0-rc.3.md)

## License

MIT