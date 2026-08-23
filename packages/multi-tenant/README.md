# dsh-multi-tenant

Context-native multi-tenant runtime primitives for DeepSeek Harness (DSH).

> Current package: `0.2.0-rc.3`, published on npm `latest`.
>
> Current DSH compatibility baseline: `0.1.1-rc.2` at release commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. The baseline is explicitly pinned and manually advanced.

## Runtime model

v0.2 models tenancy as a canonical ownership tree with one lifecycle vocabulary:

```text
Deployment / Root
│
├── shared ownership kernel
├── shared TenantRuntimeService
│
├── Tenant(acme)
│   ├── tenant capability graph
│   ├── Principal(alice)
│   │   └── principal capability graph
│   └── Principal(bob)
│
└── Tenant(globex)
```

Tenant/Principal capability authority uses Cordis service isolation. DSH Agent/Preset registration visibility remains a separate `@deepseek-ai/dsh-scope` plane.

## Supported guarantee

v0.2 combines two independent enforcement layers:

1. **Context-native capability isolation** — canonical Tenant/Principal nodes own real Cordis child lifecycles and explicit isolation labels.
2. **Persistent ownership authorization** — the v0.1 `ctx.multiTenant` kernel remains deployment-global and enforces immutable `(tenantId, userId)` session ownership.

The Runtime Contract guarantees:

- one canonical active Tenant per tenant id;
- one canonical active Principal per user id inside that Tenant;
- one `ensure/get/state/dispose` vocabulary at both levels;
- preparing nodes are never visible;
- concurrent `ensure()` calls single-flight;
- setup runs before publication and may return synchronous `commit()`;
- failed setup fully rolls back;
- preparing transactions are cancellable lifecycle resources;
- registry shutdown closes admission, cancels preparing nodes, then drains published scopes;
- active definition drift fails explicitly;
- Tenant teardown owns Principal teardown;
- ownership/security and Cordis core services cannot be isolated away.

## Canonical publication

```ts
const acme = await ctx.tenantRuntime.tenants.ensure('acme', {
  isolateServices: ['tenantAuth', 'tenantMcp'],
  setup: async ({ ctx: tenantCtx, identity, signal }) => {
    await tenantCtx.plugin(authProvider, acmeAuthConfig)
    await tenantCtx.plugin(mcpProvider, acmeMcpConfig)

    return {
      commit() {
        // Optional exact publication-boundary commit.
      },
    }
  },
})

const alice = await acme.principals.ensure('alice', {
  isolateServices: ['userCredentials'],
  setup: async ({ ctx: principalCtx }) => {
    await principalCtx.plugin(credentialsProvider, aliceCredentials)
  },
})
```

A Principal registry is structurally nested under its Tenant, so Principal creation takes only `userId`; the parent Tenant supplies `tenantId` by construction.

Calling `ensure(key)` without a definition joins an existing canonical node without requiring consumers to know its creation recipe. Only callers that explicitly supply a definition participate in definition-drift validation.

## Agent composition boundary

A canonical Principal Context is a capability root, not a bypass around Cordis dependency injection. Agent orchestration therefore runs in a derived integration fiber that explicitly injects `agents`:

```ts
const alice = await acme.principals.ensure('alice')

const operation = alice.ctx.inject(['agents'], async (ownerCtx) => {
  return ownerCtx.agents.create({
    sessionId,
    setup(agentCtx) {
      const tenantMcp = ownerCtx.get('tenantMcp')
      // Compose DSH tools/prompts/listeners into agentCtx.
    },
  })
})

await operation
```

DSH carries that caller-bound context into the Agent factory as `ownerCtx`. CI executes the real public AgentRegistry package to prove Principal identity and A/B capability separation at this boundary.

## Tenant-safe provider contract

`dsh-multi-tenant/testing` exports an executable provider conformance harness:

```ts
await assertRuntimeCapabilityProviderContract({
  serviceName: 'myCapability',
  level: 'tenant', // or 'principal'
  mount: async (ctx, marker) => { /* mount provider */ },
  fingerprint: async ctx => { /* identify resolved instance */ },
})
```

The harness checks same-name A/B isolation, root/parent non-leakage, descendant inheritance, sibling non-interference, disposal isolation, clean recreation and unpublished setup ownership.

## Context identity is not authorization

`runtimeIdentityOf(ctx)`, `tenantIdOf(ctx)` and `principalOf(ctx)` expose trusted same-process composition metadata. They are **not** durable authorization decisions. Session/durable boundaries must still use `ctx.multiTenant`.

## Explicit boundaries

This package is not a hostile-code/process sandbox. Cordis Context does not isolate process globals, filesystem, shell, network, environment variables, or a plugin deliberately escaping to `ctx.root`.

Strong isolation belongs to process/container/Pod deployment boundaries.

The package also does not claim every existing DSH provider is tenant-safe. Provider compatibility must be proven rather than assumed. Product-level auth, HTTP/WebSocket binding, billing, organization UI and production MCP SaaS composition belong to the upcoming SaaS Framework / Plugin Family.

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

The project currently publishes only one npm channel: `latest` is the newest intentionally released build.

The bundle installs three deployment-global rows:

- `ctx.tenantSessionStore` — in-memory reference ownership provider;
- `ctx.multiTenant` — persistent ownership/authorization kernel;
- `ctx.tenantRuntime` — canonical Tenant/Principal runtime manager.

## Release verification

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

CI additionally checks out the exact upstream DSH release commit and verifies its version, then runs executable compatibility probes against the exact npm packages.

## License

MIT
