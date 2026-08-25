[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

**Turn DeepSeek Harness into a multi-tenant SaaS Agent runtime.**

If you already like DeepSeek Harness but now need to put it behind a real SaaS product, this project handles the layer that usually becomes dangerous first: **which organization/user owns the request, which credentials and MCP config they may use, which Session they may resume, and which long-lived Agent lifecycle belongs to them.**

> Current published release: **`dsh-multi-tenant@0.3.0-rc.1`**
>
> This branch implements the frozen **`0.3.0-rc.2` First Product Experience** scope.
>
> Compatible DSH baseline: `0.1.1-rc.2` at `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.

## The SaaS problem

A single-user Agent is simple:

```text
request -> Agent -> MCP -> backend
```

A shared SaaS runtime is not:

```text
Acme / Alice   -> Acme ERP MCP + Alice credential + Alice Sessions
Acme / Bob     -> Acme ERP MCP + Bob credential   + Bob Sessions
Globex / Alice -> Globex ERP MCP + Globex/Alice credential + Globex Sessions
```

Without an explicit runtime boundary, all of these questions become product bugs or security bugs:

- Which Tenant and Principal owns this request?
- Which MCP endpoint/config belongs to this Tenant?
- Which credential belongs to this Principal?
- Can Bob resume Alice's Session?
- Can different Tenants use the same logical MCP server name without colliding?
- Can Agent/MCP setup fail without publishing a half-configured Agent?
- When a Principal is disposed, are its long-lived Agents and MCP tools actually drained?

`dsh-multi-tenant` gives DSH a reusable answer while preserving native Cordis/DSH lifecycle semantics.

## See the value first

`0.3.0-rc.2` adds an opt-in First Product Experience on top of the real shipped DSH Web profile.

```sh
dsh plugin --profile web add dsh-multi-tenant
DSH_MULTI_TENANT_STARTER=1 dsh web
```

Open the printed DSH URL plus `/_dsh-multi-tenant`.

The starter is **dormant by default**. The environment flag is required before any demo identity or demo route exists.

The panel lets you switch between:

```text
Acme / Alice
Acme / Bob
Globex / Alice
```

and prove this path without replacing the DSH frontend or MCP implementation:

```text
demo product login
  -> trusted subject
  -> canonical Tenant / Principal
  -> Principal-bound DSH Agent
  -> official @deepseek-ai/dsh-mcp-client
  -> real stdio MCP tools/list + tools/call
  -> visible identity + Session isolation
```

The starter MCP Tool returns the Tenant and Principal plus `credentialAccepted: true`. A Principal credential is injected into the MCP child process, but its raw value is never returned to the browser or model-facing Tool result.

Then switch from Acme/Alice to Acme/Bob and try to resume Alice's Session: the request is denied before DSH resume/persistence setup is invoked. Globex/Alice proves the same runtime path for a second Tenant.

The starter panel is mounted **beside the existing DSH Web app** on the same `ctx.webServer`; it is not another chat frontend or another HTTP server.

## Install

Inside a normal DSH profile:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

Or from framework code that already owns a compatible DSH installation:

```sh
pnpm add dsh-multi-tenant
```

The MCP path reuses the official MCP client supplied by the compatible DSH installation instead of vendoring or forking it.

## Minimal product flow

Your product still owns authentication. `0.3.0-rc.2` adds a thin MCP-specific facade so the first successful integration has four product seams: trusted identity, Tenant MCP config, Principal credentials, and Agent create/resume.

```ts
import { createMcpSaaSRuntime } from 'dsh-multi-tenant'

const app = await createMcpSaaSRuntime(ctx, {
  identity(subject: TrustedSubject) {
    // The product already authenticated this subject.
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

This facade does not replace the Core architecture. It composes the existing `CompositionPlan`, `RuntimeComposition`, Product Ingress and `createMcpAgentIntegration()` path. Advanced consumers can still use those primitives directly.

When `create()` resolves, the official MCP client has completed initial connection, `tools/list` synchronization and Tool registration inside unpublished Agent setup. `resume()` checks Session ownership before DSH persistence/setup is invoked.

### Existing JWT / Cookie / req.user

The Web bridge does not become an auth framework. It accepts the result of your existing authentication stack:

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

`readBearerToken()` and `readCookie()` only extract transport values. JWT verification, cookie/server-session validation, OAuth/OIDC, refresh and `req.user` construction remain product-owned.

## What changes after you add it

```text
Before
------
product request
  -> hand-written tenant checks
  -> hand-written credential plumbing
  -> hand-written MCP wiring
  -> hand-written Session admission
  -> DSH Agent

After
-----
already-trusted product subject
  -> Product Ingress / Web bridge
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> fail-closed Session ownership
  -> Principal-bound create/resume
  -> native DSH Agent + MCP Tools
```

In `0.3`, you get:

- trusted product subject -> canonical `Tenant / Principal`;
- exact `CompositionPlan -> RuntimeComposition` binding so product code cannot silently mix plans;
- Principal-scoped replaceable credentials;
- Tenant-scoped MCP configuration;
- safe Principal-bound Agent `create()` / `resume()`;
- immutable, fail-closed Session ownership;
- official `@deepseek-ai/dsh-mcp-client` integration — no parallel MCP protocol stack;
- native Agent-scoped MCP Tools;
- long-lived Agents owned by the Principal rather than by a short request Operation;
- an MCP-specific product facade, same-server Web identity/admission bridge and secret-safe diagnostics;
- an opt-in runnable starter backed by permanent real-DSH-Web CI evidence;
- clean installed-artifact and post-publication registry verification.

## Architecture

```text
Product / Transport authentication
        ↓ trusted subject
Product Web bridge / Product Ingress
        ↓ TenantPrincipal
RuntimeComposition                 exact whole-plan attestation
        ↓
canonical Tenant                   Tenant MCP config
        ↓
canonical Principal                Principal Credentials
        ↓
one-shot create/resume Operation   authorization + snapshot
        ↓
Principal-owned DSH Agent          long-lived
        ↓ setup before publication
official @deepseek-ai/dsh-mcp-client
        ↓
native Agent-scoped MCP Tools
```

The ownership rules are intentionally small:

- **Product owns authentication.** Core starts after identity is already trusted.
- **Core owns identity, lifecycle and composition.** It does not become a vendor-auth or ERP framework.
- **Product facade stays thin and MCP-specific.** It does not create a second Runtime abstraction.
- **Operation is short-lived semantic work.** It captures required capabilities once and does not own the long-lived Agent.
- **Principal owns the Agent.** Principal teardown drains its Agents and Agent-scoped MCP resources.
- **DSH owns MCP wire behavior.** This project composes the official MCP client instead of reimplementing MCP.

See [`docs/specs/architecture.md`](./docs/specs/architecture.md), [`docs/specs/product-ingress-credentials.md`](./docs/specs/product-ingress-credentials.md), and [`docs/specs/mcp-agent-integration.md`](./docs/specs/mcp-agent-integration.md).

## Honest Web boundary

Pinned DSH Web has an existing trusted-host `/api` carrier and preserves HTTP headers into the transport request, but its current business RPC seam does not materialize a product-authenticated Principal Context for every existing stock Web RPC call.

So rc.2 makes **product identity and Agent create/resume admission** Principal-aware and fail-closed. It does **not** claim that adding a login selector automatically tenant-authorizes every stock DSH Web RPC. That is an upstream integration seam to solve deliberately later, not something to hide behind a cosmetic login UI.

## First-use diagnostics

Product-facing failures carry stable, secret-safe layers such as:

```json
{
  "code": "SESSION_ACCESS_DENIED",
  "stage": "session-ownership",
  "message": "This Session belongs to another Principal."
}
```

Raw vendor/auth/credential causes remain server-side and are not serialized by `toProductDiagnostic()`.

The current stages cover identity resolution, Tenant MCP config, Principal credentials, Session ownership, MCP setup and explicit post-create discovery checks. The pinned official MCP client combines initial connect/discovery/register into one activation failure, so this project deliberately does not invent false precision where upstream cannot prove the exact substage.

## Security boundary

This project provides strong **same-process identity/lifecycle separation** for trusted code. Cordis Context is not a hostile-code sandbox: malicious code sharing process memory, filesystem, shell or network access is outside the guarantee.

For hostile-code or stronger secret non-disclosure requirements, use process/container/Pod/sidecar/remote authority boundaries.

The starter itself is an MVP proof: its local demo cookie is not production authentication, and its no-secret Tool result does not turn same-process code into a security sandbox.

## Compatibility and executable evidence

- Node: `^22.19.0 || >=24.0.0`
- Cordis: `>=4.0.1 <5`
- DSH: `0.1.1-rc.2` at the pinned release commit above

Existing CI still proves the real external assumptions, real stdio MCP `tools/list`, real DSH `ToolRuntime.execute()` -> MCP `tools/call`, concurrent Tenant/Principal isolation, denied cross-Principal resume, startup failure behavior, teardown, and the actual packed npm artifact.

rc.2 adds a permanent First Product Experience lane that packs the candidate, installs it into a clean pinned DSH Web profile, boots actual `dsh web`, drives login/identity/Agent/MCP/Session behavior over HTTP, verifies a second Tenant, and scans HTTP/stdout/stderr for the raw starter credential.

See [`docs/reference/compatibility.md`](./docs/reference/compatibility.md).

## Scope discipline

`0.3.0-rc.2` is intentionally an MVP value-validation release. These remain non-blocking follow-ups:

- Redis/Postgres/MySQL production Session Store;
- universal Credential Broker / Capability-as-Authority abstraction;
- generic OAuth/OIDC/token refresh framework;
- Permission/Policy plugin and full Audit/OTel product;
- second ERP/direct-API integration;
- hostile-code strong isolation;
- MCP Resources/Prompts;
- replacement frontend or broad Desktop/CLI packaging.

See [`docs/scopes/v0.3.0-rc.2.md`](./docs/scopes/v0.3.0-rc.2.md).

## Where this is going

The current `PrincipalCredentials` capability is deliberately low-level. The preferred long-term direction is **Capability-as-Authority**: Operations consume typed abilities such as an `ErpClient`/transport while secrets stay behind replaceable Broker/authority plugins whenever practical.

That is Vision, not a frozen `0.3` API. See [`docs/vision/authority-capabilities.md`](./docs/vision/authority-capabilities.md) and [`DIRECTION.md`](./DIRECTION.md).

## Release status

`0.3.0-rc.1` remains the currently published prerelease. This PR implements the frozen rc.2 scope; it does not publish the package.

The live repository keeps only current `0.3` documentation and release infrastructure; older prerelease archaeology stays in Git history/tags rather than the active tree.

See [`docs/releases/v0.3.0-rc.1.md`](./docs/releases/v0.3.0-rc.1.md), [`docs/scopes/v0.3.0-rc.2.md`](./docs/scopes/v0.3.0-rc.2.md), and [`docs/reference/release.md`](./docs/reference/release.md).

## License

MIT