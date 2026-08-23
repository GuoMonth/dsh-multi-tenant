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
│   │       └── typed one-shot snapshot -> Agent integration -> DSH
│   └── Principal(bob)
│
└── Tenant(globex)
```

Tenant/Principal/Operation capability authority uses native Cordis Context/Fiber ownership. DSH Agent/Preset registration visibility remains a separate native `@deepseek-ai/dsh-scope` plane.

## Supported guarantee

The package combines three layers:

1. **Persistent ownership authorization** — v0.1 claim-once `(tenantId, userId) -> session` invariant, fail closed.
2. **Canonical Multi-Tenant Runtime** — v0.2 Tenant/Principal identity, unpublished setup, isolation and quiescent teardown.
3. **SaaS Core composition/operation semantics** — v0.3 typed capability planning and Principal-owned one-shot work.

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
- true local creation drift fails explicitly;
- unrelated descendant Plan changes do not create false parent Runtime conflicts;
- one user-visible action executes once even if a captured provider later churns;
- DSH Agent create/resume receives the correct caller-bound Operation/Principal `ownerCtx`;
- repeated Operation cancel/dispose is idempotent and quiescent.

## Typed CapabilityToken

Capability identity is represented by one semantic token:

```ts
import {
  defineCapability,
  provideCapability,
} from 'dsh-multi-tenant'

const credentials = defineCapability<Credentials, 'principal'>(
  'credentials',
  'principal',
)
```

The token binds:

```text
stable Cordis service key
+ semantic value type
+ lifecycle/authority scope
```

`provideCapability()` / `getCapability()` are only typed facades over Cordis. They do not create storage, resolution or a second DI container.

## Low-level canonical Runtime

The v0.2 contract remains directly available:

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

Consumers may call `ensure(key)` without a definition to join an existing canonical node. Callers supplying a different semantic creation definition fail with `RuntimeDefinitionConflictError`.

## SaaS Composition

`dsh-multi-tenant/composition` separates mutable intent from executable Runtime structure:

```ts
const tenantMcpConfig = defineCapability<TenantMcpConfig, 'tenant'>('tenantMcpConfig', 'tenant')

const plan = compileSaaSDefinition({
  capabilities: [
    { capability: agents, required: true },
    { capability: tenantMcpConfig, required: true },
    { capability: credentials, required: true },
  ],
  providers: [
    { id: 'dsh-agents', capability: agents },
    {
      id: 'tenant-mcp-config',
      capability: tenantMcpConfig,
      setup({ ctx }) {
        provideCapability(ctx, tenantMcpConfig, loadTenantMcpConfig())
      },
    },
    {
      id: 'credentials',
      capability: credentials,
      requires: [tenantMcpConfig],
      setup({ ctx }) {
        provideCapability(ctx, credentials, loadCredentials())
      },
    },
  ],
})
```

The compiler resolves provider selection, dependency visibility, cycles and deterministic bootstrap order. Ambient providers are deployment-only; non-deployment providers must materially own their capability inside the declared Cordis scope.

### Whole Plan vs local canonical identity

```text
plan.fingerprint
  exact whole-plan structural identity

plan.scopeFingerprints.tenant
plan.scopeFingerprints.principal
plan.scopeFingerprints.operation
  provider dependency-closure identity for that scope
```

Canonical Tenant/Principal definitions use their local scope fingerprint. An Operation-only provider change therefore does not invalidate an unrelated existing Tenant/Principal, while a changed provider actually participating in Tenant creation still conflicts.

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
  requires: [agents, credentials],
  async execute({ capabilities, signal }) {
    const dshAgents = capabilities.require(agents)
    const credential = capabilities.require(credentials)

    return dshAgents.create({
      sessionId,
      signal,
      setup(agentCtx) {
        // Compose DSH-native Agent/Preset scoped behavior here.
      },
    })
  },
})

const handle = await operation.result
```

The token determines the snapshot return type. Operation creates a normal Principal-owned child Fiber, prepares Operation-local providers, captures required Cordis values exactly once and invokes `execute()` once. Provider churn never causes semantic re-entry.

## Framework boundary planes

Product identity ingress and Agent integration are not flattened into the Runtime Provider graph.

```text
Product authentication
  -> trusted identity resolution
  -> TenantPrincipal
  -> canonical Runtime
  -> typed capabilities
  -> Operation
  -> Agent integration
  -> DSH
```

The next v0.3 stage uses Credentials as the first real Principal capability and MCP Tools as a DSH-native Agent integration reference path rather than creating a parallel MCP stack.

See the repository spec `docs/specs/saas-boundaries.md`.

## DSH Agent boundary

CI executes the real public `@deepseek-ai/dsh-agent` AgentRegistry on the pinned baseline. The vertical proof covers concurrent multi-Tenant create, resume and downstream create failure and verifies the DSH factory sees the correct Tenant/Principal/Operation caller context.

Operation does not copy Cordis private isolation maps into `Agent.ctx`, does not create an Agent tenant registry and does not replace DSH Agent/Preset scope semantics.

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

The current gate deliberately keeps one package. `runtime`, `operation`, `composition` and `testing` are public subpaths because they still form one ownership/lifecycle contract.

A separate SaaS/Auth/MCP package should appear only if later implementation proves an independent consumer, replacement, lifecycle, release or Distribution boundary.

## Context identity is not authorization

`runtimeIdentityOf(ctx)`, `tenantIdOf(ctx)` and `principalOf(ctx)` expose trusted same-process composition metadata. They are **not** durable authorization decisions. Session/durable boundaries still use `ctx.multiTenant`.

## Explicit boundaries

This package is not a hostile-code/process sandbox. Cordis Context does not isolate process memory, filesystem, shell, network, environment variables or malicious same-process plugins.

Strong isolation belongs to process/container/Pod deployment boundaries.

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

The bundle installs the deployment-global ownership kernel and TenantRuntimeService. Typed Composition/Operation are programmatic public APIs layered on that Runtime contract.

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

CI verifies exact upstream DSH identity, Cordis lifecycle assumptions, typed/local Composition behavior, the SaaS Core vertical path on Node 22.19/24 and the packed tarball in a clean external consumer.

## License

MIT
