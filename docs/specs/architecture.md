[简体中文](./architecture.zh-CN.md) | English

# Architecture — canonical runtime, explicit planes

This document is the current architecture authority for `dsh-multi-tenant` v0.2 and the foundation that v0.3 SaaS Framework composes.

The design goal is not to spread tenant checks across APIs. It is to make tenancy a structural property of the runtime so identity, capability resolution and lifecycle ownership follow one coherent model.

## 1. Canonical runtime tree

```text
Deployment / Root
│
├── TenantSessionStore                 shared durable ownership seam
├── MultiTenantService                 shared fail-closed authorization kernel
├── TenantRuntimeService               canonical runtime root
│
├── Tenant(acme)                       canonical capability node
│   ├── tenant-local providers
│   ├── Principal(alice)               canonical capability node
│   │   ├── principal-local providers
│   │   └── derived integration fibers
│   │       └── Agent / transport / provider operations
│   └── Principal(bob)
│
└── Tenant(globex)
```

Tenant and Principal are not request DTOs. They are live runtime nodes with identity, Context, lifecycle and canonical registry semantics.

Principal is structurally nested under Tenant. A Principal registry is keyed by `userId`; its `tenantId` is derived from its parent. Cross-tenant Principal binding is therefore not merely rejected by an `if` statement — the public data model does not represent it.

## 2. One runtime-node vocabulary

Tenant and Principal share the same semantic base shape:

```ts
interface RuntimeScope<K, I> {
  readonly kind: K
  readonly identity: Readonly<I>
  readonly ctx: Context
  readonly state: 'active' | 'disposing' | 'disposed'
  dispose(): Promise<void>
}

interface RuntimeScopeRegistry<Key, Scope, Definition> {
  get(key: Key): Scope | undefined
  ensure(key: Key, definition?: Definition): Promise<Scope>
}
```

The nesting adds only the capability that structurally belongs to the parent:

```ts
interface TenantRuntimeScope extends RuntimeScope<'tenant', TenantIdentity> {
  readonly principals: RuntimeScopeRegistry<
    string,
    PrincipalRuntimeScope,
    PrincipalScopeDefinition
  >
}
```

This is deliberate: avoid unrelated special-purpose verbs such as `createTenantForRequest`, `createPrincipalForAgent`, or provider-specific runtime managers. New features should compose from this tree rather than widen the core API surface.

## 3. Creation recipe vs runtime identity

A node has two different concerns:

- **identity** — what canonical node the caller wants;
- **definition** — how a missing node should be constructed.

Consumers may join an existing node without knowing its creation recipe:

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme')
```

Configuration/bootstrap code may explicitly define creation:

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', {
  isolateServices: ['tenantAuth', 'tenantMcp'],
  setup: async ({ ctx, signal }) => {
    await ctx.plugin(authProvider)
    await ctx.plugin(mcpProvider)
  },
})
```

When an explicit definition targets an already active canonical identity, incompatible capability shape is rejected. Upper layers are not forced to duplicate lower-layer configuration merely to resolve identity.

## 4. Publication transaction

Async configuration must not make a half-built Tenant/Principal visible.

The creation state machine is:

```text
ABSENT
  │ ensure(identity, definition)
  ▼
RESERVED / PREPARING              not visible through get()
  │
  ├─ prepare isolated Cordis subtree
  ├─ await setup(signal)
  ├─ optional synchronous commit()
  │
  ├──────── success ───────────────► ACTIVE / published
  │
  └──────── failure/cancel ────────► rollback -> ABSENT
```

The optional synchronous `commit()` owns the exact publication boundary for external mutable state that must be revalidated or flipped immediately before visibility. This intentionally mirrors DSH Agent unpublished-setup/publication semantics.

Concurrent `ensure()` calls for one key single-flight into one creation transaction.

## 5. Preparing transaction is a lifecycle resource

A preparing scope is not modeled as only `Promise<Scope>`. That would lose the capability to cancel creation during parent teardown and can create a self-waiting lifecycle:

```text
Tenant.dispose()
    waits pending Principal promise
        waits forever
            only Tenant teardown could cancel it
```

The registry therefore owns a cancellable creation transaction conceptually equivalent to:

```ts
interface RuntimeCreation<Scope> {
  readonly ready: Promise<Scope>
  cancel(reason: unknown): Promise<void>
}
```

Registry teardown is ordered:

```text
OPEN
  ↓ close admission
CLOSING
  ↓ cancel all preparing creations
  ↓ dispose/drain all published scopes
CLOSED
```

Tenant disposal first closes/drains its Principal registry and then unwinds the Tenant Cordis fiber. Replacement of the same canonical identity cannot overlap a still-draining old graph.

## 6. Four independent planes

Tenancy is not one overloaded mechanism.

| Plane | Owner | Responsibility |
| --- | --- | --- |
| Persistent authorization | `MultiTenantService` + `TenantSessionStore` | Durable session ownership; fail closed. |
| Tenant/Principal capability graph | Cordis Context service isolation | Auth/MCP/credential/provider resolution and lifecycle. |
| Agent/Preset registration graph | DSH `@deepseek-ai/dsh-scope` | Agent-local tools, prompts, listeners and model-facing visibility. |
| Strong isolation | Deployment/container/K8S | Process, filesystem, shell, network, memory boundary. |

The first two are defense-in-depth, not alternatives. Context identity is trusted same-process composition metadata; it never replaces persistent ownership authorization.

## 7. Principal Context and integration fibers

A Principal Context is a canonical capability root. It is not a bypass around Cordis dependency injection.

An operation that needs a service derives a child integration fiber and explicitly injects the dependency:

```ts
const alice = await tenant.principals.ensure('alice')

const operation = alice.ctx.inject(['agents'], async (ownerCtx) => {
  return ownerCtx.agents.create({
    sessionId,
    setup(agentCtx) {
      const credentials = ownerCtx.get('userCredentials')
      // Compose Agent-local DSH registrations into agentCtx.
    },
  })
})

await operation
```

This provides a natural place for future HTTP/WebSocket request scope, Agent orchestration, tracing and operation-local cancellation without polluting the canonical Principal node with ephemeral state.

## 8. Agent boundary

Current DSH Agent creation carries the `ctx.agents.create()` caller Context into the factory as `ownerCtx`. The runtime relies on that public seam.

It deliberately does **not**:

- copy Cordis private isolation maps into `Agent.ctx`;
- make Tenant a second parent in DSH's Agent/Preset scope ancestry;
- provide an Agent-specific tenant service registry.

Instead:

```text
Principal capability root
       ↓ derived fiber (inject agents)
DSH ownerCtx boundary
       ↓ setup composition
DSH Agent/Preset scope
```

The two graphs preserve different semantics and remain composable.

## 9. Provider contract

A provider being mountable below a Context does not automatically make it tenant-safe. Providers can bypass scope through root state, module globals, process environment or other deployment-wide mutable state.

`dsh-multi-tenant/testing` therefore exposes an executable Runtime Capability Provider Contract. It verifies:

- same-name Tenant A/B isolation;
- root/parent non-leakage;
- expected descendant inheritance;
- Principal sibling isolation;
- disposing one scope does not affect another;
- recreation has no stale state;
- mounting works during unpublished setup.

Provider compatibility is a contract, not an assumption.

## 10. Dependency direction

The architecture grows upward:

```text
v0.1 ownership kernel
        ↑
v0.2 Runtime Contract
        ↑
capability contracts
        ↑
replaceable providers / integrations
        ↑
v0.3 SaaS Distribution / Framework
```

The runtime package keeps transport/vendor implementations out of core. A future SaaS distribution may install opinionated Auth, credentials, MCP, storage, audit and transport defaults, but those providers remain independently replaceable.

## 11. v0.3 composition target

```text
                         dsh-saas
                 SaaS Distribution / Framework
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
      Auth              Credentials            MCP
        │                   │                   │
    Transport              Audit              Usage
        │                   │                   │
        └──────────── Provider Contracts ───────┘
                            │
                   dsh-multi-tenant
                 Runtime Contract + Kernel
```

This is a **capability/composition map, not a package map**. Names such as Auth, Transport or MCP describe responsibilities. They become separate packages only if an independent consumer API, replacement boundary, lifecycle or release boundary is demonstrated.

The Framework provides the product experience and opinionated defaults. The Plugin Family provides the replaceable architecture.

## 12. Explicit boundary

Cordis Context is a trusted same-process capability/lifecycle structure, not a hostile-code sandbox. It does not isolate arbitrary process memory, filesystem, shell, network, environment variables or code deliberately escaping to root/process APIs.

Strong isolation belongs to deployment profiles such as one Tenant per process/container/Pod.

## 13. Compatibility baseline

Current exact DSH baseline and executable evidence policy are defined in [`../reference/compatibility.md`](../reference/compatibility.md). Architecture code must not depend on floating upstream state.
