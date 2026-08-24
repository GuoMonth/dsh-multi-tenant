[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

**Turn DeepSeek Harness into a multi-tenant SaaS Agent runtime.**

If you already like DeepSeek Harness but now need to put it behind a real SaaS product, this project handles the layer that usually becomes dangerous first: **which organization/user owns the request, which credentials and MCP config they may use, which Session they may resume, and which long-lived Agent lifecycle belongs to them.**

> Release candidate: **`dsh-multi-tenant@0.3.0-rc.1`**
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

`dsh-multi-tenant` gives DSH a reusable answer to those questions while preserving native Cordis/DSH lifecycle semantics.

## What changes after you add it

```text
Before
------
product request
  -> hand-written tenant checks
  -> hand-written credential plumbing
  -> hand-written MCP wiring
  -> DSH Agent

After
-----
trusted product subject
  -> Product Ingress
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
- clean installed-artifact and post-publication registry verification.

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

Your product still owns authentication. Once a request is trusted, map it to a Tenant/Principal, provide Tenant MCP config and Principal credentials, then create or resume an Agent.

```ts
const plan = compileSaaSDefinition({
  capabilities: [
    { capability: tenantMcpConfig, required: true },
    { capability: principalCredentials, required: true },
  ],
  providers: [
    defineTenantMcpConfigProvider({
      id: 'tenant-mcp',
      load({ tenantId }) {
        return {
          servers: [{
            transport: 'streamable-http',
            serverName: 'erp',
            url: endpointFor(tenantId),
            credentialHeaders: {
              Authorization: { credential: 'erpToken', prefix: 'Bearer ' },
            },
          }],
        }
      },
    }),
    definePrincipalCredentialsProvider({
      id: 'credentials',
      create({ principal }) {
        return loadCredentialsFor(principal)
      },
    }),
  ],
})

const app = await materializeRuntimeComposition(ctx, plan)
const ingress = createProductIngress(app, resolveTrustedSubject)
const principal = await ingress.resolve(subject)

const agents = createMcpAgentIntegration(principal)
const handle = await agents.create({ sessionId })
```

When `create()` resolves, the official MCP client has completed initial discovery inside Agent setup, so the returned Agent already owns its native MCP Tools. `resume()` checks Session ownership before DSH persistence/setup is invoked.

## Architecture

```text
Product / Transport authentication
        ↓ trusted subject
Product Ingress
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
- **Operation is short-lived semantic work.** It captures required capabilities once and does not own the long-lived Agent.
- **Principal owns the Agent.** Principal teardown drains its Agents and Agent-scoped MCP resources.
- **DSH owns MCP wire behavior.** This project composes the official MCP client instead of reimplementing MCP.

See [`docs/specs/architecture.md`](./docs/specs/architecture.md), [`docs/specs/product-ingress-credentials.md`](./docs/specs/product-ingress-credentials.md), and [`docs/specs/mcp-agent-integration.md`](./docs/specs/mcp-agent-integration.md).

## Security boundary

This project provides strong **same-process identity/lifecycle separation** for trusted code. Cordis Context is not a hostile-code sandbox: malicious code sharing process memory, filesystem, shell or network access is outside the guarantee.

For hostile-code or secret non-disclosure requirements, use process/container/Pod/sidecar/remote authority boundaries.

## Compatibility and release evidence

- Node: `^22.19.0 || >=24.0.0`
- Cordis: `>=4.0.1 <5`
- DSH: `0.1.1-rc.2` at the pinned release commit above

CI proves the real external assumptions, a real stdio MCP server, real `tools/list`, real DSH `ToolRuntime.execute()` -> MCP `tools/call`, concurrent Tenant/Principal isolation, denied cross-Principal resume, startup failure behavior, teardown, and the actual packed npm artifact.

See [`docs/reference/compatibility.md`](./docs/reference/compatibility.md).

## Where this is going

The current `PrincipalCredentials` capability is deliberately low-level. The preferred long-term direction is **Capability-as-Authority**: Operations consume typed abilities such as an `ErpClient`/transport while secrets stay behind replaceable Broker/authority plugins whenever practical.

That is Vision, not a frozen `0.3` API. See [`docs/vision/authority-capabilities.md`](./docs/vision/authority-capabilities.md) and [`DIRECTION.md`](./DIRECTION.md).

## Release status

`0.3.0-rc.1` is a prerelease and the project is intentionally moving fast. Breaking changes are acceptable when real integrations prove a better contract.

The live repository keeps only current `0.3` release documentation and current release infrastructure; older prerelease archaeology stays in Git history/tags rather than the active tree.

See [`docs/releases/v0.3.0-rc.1.md`](./docs/releases/v0.3.0-rc.1.md) and [`docs/reference/release.md`](./docs/reference/release.md).

## License

MIT
