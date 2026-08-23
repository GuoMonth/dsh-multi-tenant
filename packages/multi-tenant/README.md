# dsh-multi-tenant

Context-native multi-tenant runtime primitives for DeepSeek Harness (DSH).

> **v0.2 line:** the project is converging the runtime contract required by a future SaaS Framework. Published v0.1 tags remain frozen historical contracts for immutable session ownership + fail-closed authorization.
>
> Executable DSH compatibility target remains the proven `0.1.0-rc.7` closure while the runtime contract is stabilized.

## Runtime model

v0.2 treats tenancy as one canonical ownership tree with one lifecycle vocabulary:

```text
Deployment / Root
│
├── shared ownership kernel
├── shared TenantRuntimeService
│
├── Tenant(acme)                    canonical runtime node
│   ├── tenant capability graph
│   ├── Principal(alice)            canonical runtime node
│   │   └── principal capabilities
│   └── Principal(bob)
│
└── Tenant(globex)
```

DSH Agent/Preset scope remains a separate registration plane. A Principal Context is the **owner/composition boundary** from which Agent creation is invoked; Agent setup explicitly projects/composes the capabilities it needs. v0.2 does not fake direct service inheritance into `Agent.ctx` by copying private Cordis isolation state.

## Supported guarantees

v0.2 combines two independent enforcement layers:

1. **Context-native capability isolation** — Tenant/Principal nodes own real Cordis child lifecycles and explicit service-isolation labels.
2. **Persistent ownership authorization** — the v0.1 `ctx.multiTenant` service remains deployment-global and enforces immutable `(tenantId, userId)` session ownership.

The runtime contract additionally guarantees:

- one canonical active Tenant node per tenant id;
- one canonical active Principal node per user id inside a Tenant;
- the same `ensure/get/state/dispose` semantics at both levels;
- preparing scopes are never visible through `get()`;
- concurrent `ensure()` calls single-flight to one creation;
- setup runs while the scope is unpublished;
- setup may return a synchronous publication `commit()`;
- setup failure rolls the unpublished subtree back completely;
- active canonical nodes reject capability-definition drift;
- Tenant disposal owns and drains Principal disposal first;
- the ownership kernel and Cordis core services cannot be isolated away.

## Canonical publication

```ts
const acme = await ctx.tenantRuntime.tenants.ensure('acme', {
  isolateServices: ['tenantAuth', 'tenantMcp'],
  setup: async ({ ctx: tenantCtx, identity, signal }) => {
    await tenantCtx.plugin(authProvider, acmeAuthConfig)
    await tenantCtx.plugin(mcpProvider, acmeMcpConfig)

    // Optional: return a synchronous commit when external mutable state must
    // be revalidated/flipped exactly at publication time.
    return {
      commit() {
        // publication commit
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

`ctx.tenantRuntime.tenants.get('acme')` returns `undefined` while setup is still running. Only an active committed node is observable.

Tenant and Principal expose the same base shape:

```ts
interface RuntimeScope<K, I> {
  readonly kind: K
  readonly identity: Readonly<I>
  readonly ctx: Context
  readonly state: 'active' | 'disposing' | 'disposed'
  dispose(): Promise<void>
}
```

A Principal registry is structurally nested under its Tenant, so its key is only `userId`; `tenantId` is derived from the parent and cannot disagree by construction.

## Agent composition boundary

Current DSH Agent creation already carries the `ctx.agents.create()` caller Context into the factory as `ownerCtx`. v0.2 relies on that real seam:

```ts
const alice = await acme.principals.ensure('alice')

await alice.ctx.agents.create({
  sessionId,
  setup(agentCtx) {
    // Explicitly compose/project from the Principal runtime into Agent scope.
    const tenantMcp = alice.ctx.get('tenantMcp')
    // register tools/prompt/listeners/etc. on agentCtx
  },
})
```

This keeps two concepts separate:

- **Cordis Tenant/Principal service isolation:** capability authority and provider lifetime.
- **DSH Agent/Preset scope:** model-facing registrations, Agent-local lifecycle and visibility.

The repository ships a compatibility probe that executes the real DSH AgentRegistry path and verifies the caller-bound Principal Context and A/B capability separation at this boundary.

## Tenant-safe provider contract

A provider being mountable under a Context does not automatically make it tenant-safe. `dsh-multi-tenant/testing` therefore exports an executable conformance harness:

```ts
await assertRuntimeCapabilityProviderContract({
  serviceName: 'myCapability',
  level: 'tenant', // or 'principal'
  mount: async (ctx, marker) => { /* mount provider */ },
  fingerprint: async ctx => { /* identify resolved instance */ },
})
```

The harness checks same-name A/B isolation, root/parent non-leakage, descendant inheritance, sibling non-interference, teardown isolation, clean recreation, and mounting inside the unpublished setup transaction.

## Context identity is not authorization

`runtimeIdentityOf(ctx)`, `tenantIdOf(ctx)` and `principalOf(ctx)` expose trusted same-process composition metadata. They are **not** durable authorization decisions. Session/durable boundaries must still use `ctx.multiTenant`.

## Explicit boundaries

This package is not a hostile-code or process sandbox. Cordis Context does not isolate process globals, filesystem, shell, network, environment variables, or a plugin deliberately escaping to `ctx.root`.

Strong isolation belongs to a process/container/Pod deployment boundary.

v0.2 also does not claim that every DSH provider is tenant-safe. A known example is the reviewed DSH MCP client's root-scoped `serverName` reservation; that requires an upstream/provider seam or different names. The runtime records such gaps rather than hiding them behind another service registry.

Auth products, HTTP/WebSocket binding, billing, organization UI, production MCP SaaS integration and other product-level composition belong to the future SaaS Framework / Plugin Family, not this runtime primitive.

## Install

Prereleases use the `next` dist-tag:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

The bundle installs three deployment-global rows:

- `ctx.tenantSessionStore` — in-memory reference ownership provider;
- `ctx.multiTenant` — persistent ownership/authorization kernel;
- `ctx.tenantRuntime` — canonical Tenant/Principal runtime manager.

## Release verification

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

The gates cover package invariants, typecheck, unit/contract tests, packed external-consumer smoke, session/admission probes, and the DSH Agent owner-context proof.

## License

MIT
