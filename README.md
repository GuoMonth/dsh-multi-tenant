[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Make DeepSeek Harness (DSH) a real **Multi-Tenant Runtime** and provide a composable **SaaS Framework Core** without replacing Cordis/DSH lifecycle semantics.

> Published foundation: `dsh-multi-tenant@0.2.0-rc.3`.
>
> Active v0.3 development: CompositionPlan binding/attestation, Product Ingress and Principal Credentials are now part of the Core contract; **the next focus is only M5 real MCP Tools Agent Integration**.
>
> Pinned DSH baseline: `0.1.1-rc.2` at `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`; CI does not follow floating `latest`/`master`.

## Architecture

```text
Product / Transport authentication
        ↓ already trusted subject
Product Ingress Boundary
        ↓ TenantPrincipal
RuntimeComposition                 exact whole-plan attestation
        ↓
canonical Tenant                   scope-local identity
        ↓
canonical Principal                Principal Credentials
        ↓
Principal-owned Operation          one-shot typed snapshot
        ↓
Agent Integration
        ↓
DeepSeek Harness
```

The important boundaries stay separate:

- product authentication is owned by the product/transport layer;
- Product Ingress only maps a trusted subject to `TenantPrincipal`;
- `RuntimeComposition` binds one exact `CompositionPlan` to one active materialized product Runtime;
- Tenant/Principal canonical identity still uses scope-local dependency-closure fingerprints;
- Runtime capabilities are Cordis-owned services, not a second DI container;
- Operations are one-shot semantic work, not reactive `ctx.inject()` callbacks;
- Agent integration composes trusted Runtime state into native DSH Agent/Preset/plugin seams;
- strong hostile-code isolation belongs to process/container/Pod boundaries.

## Bound RuntimeComposition

The low-level v0.2 Runtime APIs remain available, but SaaS product code should materialize a Plan once and use the bound view instead of manually mixing definitions from different Plans:

```ts
const plan = compileSaaSDefinition(definition)
const app = await materializeRuntimeComposition(ctx, plan)

const acme = await app.tenants.ensure('acme')
const alice = await acme.principals.ensure('alice')

const operation = alice.operations.start({
  requires: [someCapability],
  execute({ capabilities }) {
    return capabilities.require(someCapability)
  },
})
```

Same-plan materialization joins/single-flights. A different whole-plan fingerprint on the same root fails with `RuntimeCompositionConflictError`. The attestation is carried by composed Tenant/Principal handles, while `scopeFingerprints` continue to control canonical creation drift.

`RuntimeComposition.dispose()` closes product-facing admission, drains every Tenant it touched (therefore Principals and Operations), then releases deployment composition.

See `docs/specs/runtime-composition.md`.

## M4: Product Ingress + Principal Credentials

Authentication protocol parsing is intentionally outside Core:

```ts
const ingress = createProductIngress(app, trustedSubject => ({
  tenantId: trustedSubject.organization,
  userId: trustedSubject.account,
}))

const principal = await ingress.resolve(trustedSubject)
```

The first real product-facing Runtime capability is canonical Principal Credentials:

```ts
const provider = definePrincipalCredentialsProvider({
  id: 'credentials',
  definitionKey: 'v1',
  create({ principal }) {
    return new InMemoryPrincipalCredentials({
      erpApiToken: loadTokenFor(principal),
    })
  },
})

const definition = {
  capabilities: [{ capability: principalCredentials, required: true }],
  providers: [provider],
}
```

`principalCredentials` is Principal-scoped, isolated between siblings/Tenants, replaceable without changing Core, and consumed through the one-shot Operation snapshot. The in-memory implementation is intentionally a reference/test implementation, not a production secret store, and does not expose an enumeration API.

**Positioning:** `PrincipalCredentials` is the current low-level credential primitive used to get real product flows working. It is not a statement that raw-token access is the long-term recommended Agent/Operation API. Over time, Integration Plugins should prefer typed abilities such as `ErpClient` or `McpTransport`, keeping secrets behind a replaceable authority/broker boundary. This long-term direction does not change the current M4 contract and must not block M5.

See `docs/specs/m4-product-ingress-credentials.md`; see `docs/vision/authority-capabilities.md` for the non-binding long-term direction.

## Core guarantees

Current executable evidence covers:

- immutable claim-once Session ownership and fail-closed authorization;
- canonical Tenant/Principal publication, rollback, single-flight and teardown;
- typed `CapabilityToken<T, Scope>` composition with fail-fast dependency validation;
- global Plan fingerprint plus scope-local canonical fingerprints;
- one exact active `RuntimeComposition` per root Context, with whole-plan conflict detection;
- bound Operations cannot request capabilities outside their Plan;
- trusted subject -> canonical Tenant/Principal mapping;
- Principal Credentials sibling/Tenant isolation, missing-secret failure and provider replacement;
- Principal-owned Operations execute semantic work once under provider churn;
- real pinned DSH Agent create/resume/failure ownership evidence;
- Node 22.19 and Node 24 plus packed external-consumer checks.

## M5 preview

The next target is deliberately small: **do not redesign M4 and do not freeze a universal Broker API yet**.

```text
Product Ingress
  -> RuntimeComposition
  -> Tenant MCP config + Principal Credentials
  -> Operation snapshot
  -> Agent Integration
  -> DSH Agent setup
  -> @deepseek-ai/dsh-mcp-client
  -> native MCP Tools
```

Use the existing Credentials primitive to ship a real DSH MCP Tools vertical slice first. If a brokered helper naturally appears, keep it private. Only after MCP plus a second real integration (for example ERP) prove repeated authority/refresh/injection/audit semantics should a later prerelease extract a public Broker contract with deliberate breaking changes.

No parallel MCP protocol stack and no Resources/Prompts bridge until DSH exposes a stable native consumer seam. `ROADMAP.md` records only the current focus and long-term direction rather than a detailed milestone list.

## Long-term principle

```text
Core identity / lifecycle
        ↓
Authority / Credential Broker plugin
        ↓
Service Integration plugin
        ↓
Typed Client / Transport capability
        ↓
Operation
```

> **Core owns identity/lifecycle; Broker owns authority/secrets; Integration owns vendor protocol; Operation consumes typed abilities; secrets stay behind the authority boundary whenever practical.**

Different ERP/MCP/GitHub/vendor integrations should grow as composable Integration Plugins. A Broker should likewise be a replaceable plugin capability rather than a Core god object. See `docs/vision/authority-capabilities.md`.

## Public subpaths

```text
dsh-multi-tenant
dsh-multi-tenant/runtime
dsh-multi-tenant/operation
dsh-multi-tenant/composition
dsh-multi-tenant/runtime-composition
dsh-multi-tenant/ingress
dsh-multi-tenant/credentials
dsh-multi-tenant/store
dsh-multi-tenant/testing
```

## Security boundary

Cordis Context is a trusted same-process composition/lifecycle boundary. It does not isolate process memory, filesystem, shell, network, environment variables or malicious same-process plugins. A future same-process Broker can materially reduce normal-path secret exposure, but it cannot make hostile same-process code safe; strong isolation still belongs to process/container/Pod/sidecar/remote authority boundaries.

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

## Verify

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

## License

MIT
