# dsh-multi-tenant

**Run DeepSeek Harness safely behind a multi-tenant SaaS product.**

Use this package when one DSH runtime must serve many organizations and users without mixing Tenant configuration, Principal credentials, Session ownership or Agent-scoped MCP Tools.

> **`dsh-multi-tenant@0.3.0-rc.1`** is the currently published prerelease. This branch implements the frozen `0.3.0-rc.2` First Product Experience scope. Compatible DSH baseline: `0.1.1-rc.2`.

## The problem

A single-user Agent looks like this:

```text
request -> Agent -> MCP -> backend
```

A SaaS Agent runtime has to keep this safe instead:

```text
Acme / Alice   -> Acme MCP + Alice credential + Alice Sessions
Acme / Bob     -> Acme MCP + Bob credential   + Bob Sessions
Globex / Alice -> Globex MCP + Globex/Alice credential + Globex Sessions
```

Without a reusable runtime boundary, every product ends up hand-building Tenant lookup, credential plumbing, MCP setup, Session authorization and Agent lifecycle rules.

`dsh-multi-tenant` turns that into one product path:

```text
already-authenticated product subject
  -> Tenant / Principal
  -> Tenant MCP config
  -> Principal credentials
  -> fail-closed Session ownership
  -> Principal-bound Agent create/resume
  -> native DSH MCP Tools
```

## Install

Inside a compatible DSH profile:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

Or from framework code that already owns the compatible DSH installation:

```sh
pnpm add dsh-multi-tenant
```

The MCP path reuses the official `@deepseek-ai/dsh-mcp-client` supplied by that DSH installation. This package does not vendor or fork MCP.

### See the MVP before integrating your product

Install it into the shipped Web profile, opt in to the starter, then open the printed DSH URL plus `/_dsh-multi-tenant`:

```sh
dsh plugin --profile web add dsh-multi-tenant
DSH_MULTI_TENANT_STARTER=1 dsh web
```

The starter is **dormant by default**. The environment flag is required before it publishes demo identities or routes.

The browser panel gives you three identities:

```text
Acme / Alice
Acme / Bob
Globex / Alice
```

From there you can create an Agent, execute the starter's real stdio MCP `who_am_i` Tool, resume the owner Session, switch to Bob and observe the cross-Principal resume denial. The Tool confirms that a Principal credential reached the MCP process with `credentialAccepted: true`; it never returns the raw credential.

This panel is mounted beside the existing DSH Web app. It is not a replacement chat frontend.

## Quick start

For product code, `0.3.0-rc.2` adds one opinionated MCP-specific facade over the existing Core. Your first-success integration needs four product concepts: identity, Tenant MCP config, Principal credentials and Agent create/resume.

```ts
import {
  createMcpSaaSRuntime,
  InMemoryPrincipalCredentials,
} from 'dsh-multi-tenant'

const app = await createMcpSaaSRuntime(ctx, {
  identity(subject: TrustedSubject) {
    // subject is already authenticated by your product.
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

`createMcpSaaSRuntime()` does not replace `CompositionPlan`, `RuntimeComposition`, `ProductIngress` or `createMcpAgentIntegration`; it composes those existing primitives into the shortest current product path. Advanced consumers can still use the Core APIs directly.

When `create()` resolves, the official DSH MCP client has completed initial connection, `tools/list` synchronization and Tool registration. `resume()` checks Session ownership before DSH persistence/setup runs.

### Web identity bridge

Authentication remains product-owned. The Web bridge only consumes the trusted result:

```ts
import {
  mountMcpSaaSWebBridge,
  readBearerToken,
  readCookie,
} from 'dsh-multi-tenant'

mountMcpSaaSWebBridge(ctx, app, {
  async authenticate(req) {
    // Example only: verify using your existing auth stack first.
    const jwt = readBearerToken(req.headers)
    if (jwt) return verifyExistingJwt(jwt)

    const sessionId = readCookie(req.headers, 'product_session')
    if (sessionId) return lookupExistingServerSession(sessionId)

    return undefined
  },
})
```

`readBearerToken()` and `readCookie()` are transport extractors, not authentication. JWT signature verification, OIDC, cookie/session validation, refresh and user lookup stay in the product that already owns them.

## What 0.3 provides

- canonical Tenant / Principal resolution from trusted product identity;
- exact `CompositionPlan -> RuntimeComposition` binding;
- Principal-scoped replaceable credentials;
- Tenant-scoped MCP configuration;
- Principal-bound Agent `create()` / `resume()`;
- immutable, fail-closed Session ownership;
- deterministic per-Session MCP namespaces;
- Principal-owned long-lived Agents;
- official DSH MCP Tools integration;
- an MCP-specific product facade rather than a second Runtime;
- a thin same-server DSH Web identity/admission bridge;
- structured secret-safe first-use diagnostics;
- an opt-in real-DSH-Web starter and permanent end-to-end evidence lane;
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

The important boundaries are simple:

- Product owns authentication.
- Core owns identity, composition and lifecycle.
- The product facade is MCP-specific and thin; it does not create a parallel Core.
- Operation owns one short semantic decision, not the Agent lifetime.
- Principal owns long-lived Agents.
- DSH owns MCP wire behavior and initial Tool discovery.

### Pinned DSH Web boundary

The pinned DSH Web `/api` carrier preserves HTTP headers and enforces its host-trust fence, but it does not materialize a product-authenticated Principal Context for every existing stock Web RPC business method. Therefore the rc.2 bridge makes product identity and Agent create/resume admission Principal-aware; it does **not** claim that a login selector magically tenant-authorizes every stock DSH Web RPC.

That limitation is explicit because an honest boundary is safer than a cosmetic login screen.

## Diagnostics

Product-facing errors expose only stable fields such as:

```json
{
  "code": "SESSION_ACCESS_DENIED",
  "stage": "session-ownership",
  "message": "This Session belongs to another Principal."
}
```

Raw vendor/auth/credential causes are retained as server-side error causes and are never serialized by `toProductDiagnostic()`.

The current stages are identity, Tenant MCP config, Principal credential, Session ownership, MCP setup and explicit post-create MCP discovery checks. The pinned official MCP client reports initial connect/discovery/register as one activation failure, so this package does not guess a finer failure stage when upstream cannot prove it.

## Security boundary

Cordis Context provides trusted same-process identity/lifecycle separation, not hostile-code isolation. Strong secret/process/filesystem/network isolation belongs to process/container/Pod/sidecar/remote deployment boundaries.

The starter demonstrates secret non-disclosure at the product/MCP response boundary, but it is not a hostile-code sandbox and its demo cookie is not a production authentication mechanism.

## Compatibility

- Node: `^22.19.0 || >=24.0.0`
- Cordis: `>=4.0.1 <5`
- DSH: `0.1.1-rc.2`

CI verifies the packed artifact in a clean consumer beside the pinned DSH installation. The First Product Experience lane additionally boots a clean real `dsh web` profile and proves real identity -> Agent -> official MCP client -> Tool execution plus cross-Principal Session denial and second-Tenant isolation.

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
dsh-multi-tenant/starter   # opt-in demo plugin only
dsh-multi-tenant/store
dsh-multi-tenant/testing
```