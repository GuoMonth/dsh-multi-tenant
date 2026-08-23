# dsh-multi-tenant

Context-native multi-tenant Runtime and v0.3 SaaS Framework Core primitives for DeepSeek Harness (DSH).

> Published package line: `0.2.0-rc.3` on npm `latest`; the repository is actively developing the v0.3 Core on top of that Runtime contract.
>
> Pinned DSH compatibility baseline: `0.1.1-rc.2` at release commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.

## Runtime model

```text
Deployment / Root
│
├── shared TenantSessionStore
├── shared MultiTenantService
├── shared TenantRuntimeService
│
├── Tenant(acme)
│   ├── tenant capabilities
│   ├── Principal(alice)
│   │   ├── principal capabilities
│   │   └── Operation
│   │       ├── operation capabilities
│   │       └── one-shot snapshot -> DSH Agent
│   └── Principal(bob)
│
└── Tenant(globex)
```

Tenant/Principal/Operation capability authority uses native Cordis Context/Fiber ownership. DSH Agent/Preset registration visibility remains a separate native `@deepseek-ai/dsh-scope` plane.

## Supported guarantee

The package combines three layers:

1. **Persistent ownership authorization** — v0.1 claim-once `(tenantId, userId) -> session` invariant, fail closed.
2. **Canonical Multi-Tenant Runtime** — v0.2 Tenant/Principal identity, unpublished setup, isolation and quiescent teardown.
3. **SaaS Core composition/operation semantics** — v0.3 deterministic capability planning and Principal-owned one-shot work.

Current guarantees include:

- one canonical active Tenant per tenant id;
- one canonical active Principal per user id inside that Tenant;
- unpublished setup and explicit publication boundary;
- concurrent `ensure()` single-flight;
- failed setup rollback;
- Tenant teardown owns Principal teardown;
- Principal teardown closes Operation admission and drains Operations;
- capability scope maps to a real Cordis ownership boundary;
- invalid SaaS graphs fail before Runtime bootstrap;
- equivalent Plans normalize deterministically;
- structurally different Plans cannot silently share an active canonical node;
- one user-visible action executes once even if a captured provider later churns;
- DSH Agent create/resume receives the correct caller-bound Operation/Principal `ownerCtx`;
- repeated Operation cancel/dispose is idempotent and quiescent.

## Canonical publication

The v0.2 low-level Runtime contract remains available directly:

```ts
const acme = await ctx.tenantRuntime.tenants.ensure('acme', {
  isolateServices: ['tenantAuth'],
  definitionKey: 'tenant-auth:v1',
  setup: async ({ ctx: tenantCtx }) => {
    await tenantCtx.plugin(authProvider)
  },
})

const alice = await acme.principals.ensure('alice', {
  isolateServices: ['userCredentials'],
  definitionKey: 'credentials:v1',
  setup: async ({ ctx: principalCtx }) => {
    await principalCtx.plugin(credentialsProvider)
  },
})
```

Consumers may call `ensure(key)` without a definition to join an existing canonical node. Callers that know the creation recipe can supply `definitionKey`; a different key/isolation definition fails with `RuntimeDefinitionConflictError`.

The v0.3 Composition layer generates these canonical definition identities from a deterministic Plan fingerprint.

## SaaS Composition

`dsh-multi-tenant/composition` separates mutable product intent from executable Runtime structure:

```ts
const plan = compileSaaSDefinition({
  capabilities: [
    { key: 'agents', scope: 'deployment', required: true },
    { key: 'tenantMcp', scope: 'tenant', required: true },
    { key: 'credentials', scope: 'principal', required: true },
  ],
  providers: [
    { id: 'dsh-agents', capability: 'agents', scope: 'deployment' },
    {
      id: 'tenant-mcp',
      capability: 'tenantMcp',
      scope: 'tenant',
      setup({ ctx }) {
        ctx.provide('tenantMcp', makeTenantMcp())
      },
    },
    {
      id: 'credentials',
      capability: 'credentials',
      scope: 'principal',
      requires: ['tenantMcp'],
      setup({ ctx }) {
        ctx.provide('credentials', loadCredentials())
      },
    },
  ],
})
```

The compiler resolves provider selection, dependency visibility, cycles, scope placement and deterministic bootstrap order. Non-deployment providers must actually materialize in their declared scope; an ambient provider is deployment-only.

Use the Plan to derive Runtime definitions:

```ts
const deployment = await bootstrapDeploymentComposition(ctx, plan)
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinitionFromPlan(plan))
const alice = await tenant.principals.ensure('alice', principalDefinitionFromPlan(plan))
```

## One-shot Operation boundary

Do **not** model one user request as a raw `principal.ctx.inject(...)` callback. Cordis injection is reactive and may rerun when required services disappear and return.

Use the Principal-owned Operation registry:

```ts
const operation = alice.operations.start({
  ...operationDefinitionFromPlan(plan),
  requires: ['agents', 'tenantMcp', 'credentials'],
  async execute({ capabilities, signal }) {
    const agents = capabilities.require<any>('agents')
    const credentials = capabilities.require('credentials')

    return agents.create({
      sessionId,
      signal,
      setup(agentCtx) {
        // Compose DSH-native Agent/Preset scoped tools/prompts/listeners here.
      },
    })
  },
})

const handle = await operation.result
```

The Operation creates a normal Principal-owned child Fiber, prepares operation-local providers, resolves all required Cordis capabilities once into an immutable snapshot, then invokes `execute()` once. Provider churn never causes semantic re-entry.

The captured capability is still the real Cordis value/traceable service; this is not a second service registry.

## DSH Agent boundary

CI executes the real public `@deepseek-ai/dsh-agent` AgentRegistry on the pinned baseline. The vertical proof covers concurrent multi-Tenant create, resume and downstream create failure, and verifies that the DSH factory sees the correct Tenant/Principal/Operation caller context.

Operation does not copy Cordis private isolation maps into `Agent.ctx`, does not create an Agent tenant registry, and does not replace DSH Agent/Preset scope semantics.

## Tenant-safe provider contract

`dsh-multi-tenant/testing` exports executable provider conformance:

```ts
await assertRuntimeCapabilityProviderContract({
  serviceName: 'myCapability',
  level: 'tenant', // or 'principal'
  mount: async (ctx, marker) => { /* mount provider */ },
  fingerprint: async ctx => { /* identify resolved instance */ },
})
```

The harness checks same-name A/B isolation, parent/root non-leakage, descendant inheritance, sibling non-interference, teardown isolation, recreation and unpublished setup ownership.

## Package boundary

The M3 gate deliberately keeps one package. `runtime`, `operation`, `composition` and `testing` are public subpaths of `dsh-multi-tenant` because they currently form one ownership/lifecycle contract.

A separate SaaS package should appear only if later Auth/Credentials/MCP contracts prove an independent consumer, replacement, lifecycle, release or Distribution boundary.

## Context identity is not authorization

`runtimeIdentityOf(ctx)`, `tenantIdOf(ctx)` and `principalOf(ctx)` expose trusted same-process composition metadata. They are **not** durable authorization decisions. Session/durable boundaries still use `ctx.multiTenant`.

## Explicit boundaries

This package is not a hostile-code/process sandbox. Cordis Context does not isolate process memory, filesystem, shell, network, environment variables or malicious same-process plugins.

Strong isolation belongs to process/container/Pod deployment boundaries.

The package also does not claim every DSH/provider implementation is automatically tenant-safe. Provider compatibility must be proven. Production Auth, credentials/secrets, MCP ecosystem integrations, audit/usage and Distribution polish remain later v0.3/v0.4 work.

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

The bundle installs the deployment-global ownership kernel and TenantRuntimeService. Composition/Operation are programmatic public APIs layered on the Runtime contract.

## Public subpaths

```text
dsh-multi-tenant
dsh-multi-tenant/runtime
dsh-multi-tenant/operation
dsh-multi-tenant/composition
dsh-multi-tenant/store
dsh-multi-tenant/testing
```

## Release verification

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

CI verifies exact upstream DSH identity, Cordis lifecycle assumptions, the SaaS Core vertical path on Node 22.19/24, and the packed tarball in a clean external consumer.

## License

MIT
