# dsh-multi-tenant

Context-native multi-tenant runtime primitives for DeepSeek Harness (DSH).

> **v0.2 line:** `0.2.0-rc.1` moves the project from an authorization-only kernel toward a real multi-tenant runtime. The published v0.1 tags are frozen historical contracts: immutable session ownership + fail-closed authorization. v0.2 keeps that kernel and adds tenant/principal Cordis capability scopes.
>
> Executable DSH compatibility target remains the proven `0.1.0-rc.7` closure for this architecture PR. Current upstream `0.1.1-rc.2` scope behavior was reviewed; dependency/lockfile upgrade is a separate follow-up.

## Supported guarantee

v0.2 has two enforcement layers:

1. **Context-native capability isolation** — `ctx.tenantRuntime` mints real Cordis child lifecycles. Selected service names receive tenant-local and optionally principal-local isolation labels. Plugins/providers mounted below those contexts resolve inside that capability graph rather than through an application-level `tenantId -> service` registry.
2. **Persistent ownership authorization** — the v0.1 `ctx.multiTenant` service remains deployment-global and enforces immutable `(tenantId, userId)` session ownership with fail-closed access decisions.

The ownership kernel still guarantees:

- claim-once immutable ownership;
- unconditional cross-tenant denial;
- same-user ownership in v0.x;
- unknown/foreign sessions fail closed;
- non-enumerating public denial errors;
- a replaceable async `TenantSessionStore` seam.

The runtime additionally guarantees:

- one canonical live tenant capability graph per `TenantRuntimeService`;
- exact tenant/principal identity binding to the returned contexts;
- tenant-local Cordis service resolution for explicitly isolated services;
- principal-local Cordis service resolution for explicitly isolated services;
- the ownership kernel, runtime manager, and Cordis core services cannot be accidentally isolated away;
- tenant/principal scope disposal follows Cordis fiber lifecycle.

## Context-native runtime

The runtime deliberately uses Cordis as the scope system instead of inventing another dependency container.

```ts
const acme = ctx.tenantRuntime.createTenant('acme', {
  isolateServices: ['tenantAuth', 'tenantMcp'],
})

await acme.ctx.plugin(authProvider, acmeAuthConfig)
await acme.ctx.plugin(mcpProvider, acmeMcpConfig)

const alice = acme.createPrincipal(
  { tenantId: 'acme', userId: 'alice' },
  { isolateServices: ['userCredentials'] },
)

await alice.ctx.plugin(credentialsProvider, aliceCredentials)
```

Conceptually:

```text
Deployment / Root Context
│
├── shared ownership kernel (ctx.multiTenant)
├── shared durable ownership store
│
├── Tenant A Context
│   ├── tenant-local auth / MCP / providers
│   └── Principal Alice Context
│       └── user-local credentials
│
└── Tenant B Context
    ├── tenant-local auth / MCP / providers
    └── Principal Bob Context
        └── user-local credentials
```

`tenantIdOf(ctx)` and `principalOf(ctx)` expose the trusted same-process contextual identity to plugins. They are routing/composition metadata, **not authorization decisions**. Durable/session boundaries must still use `ctx.multiTenant`.

### Two scope planes, on purpose

DSH already has `@deepseek-ai/dsh-scope` for Agent/Preset registration visibility. v0.2 does **not** reuse that single parent chain as the tenant authority graph because Agent Presets already use the Agent scope parent relation.

- **Cordis service isolation:** tenant/principal capability providers.
- **DSH scope chain:** Agent/Preset tools, prompt contributions, listeners and other registration views.

Keeping these planes separate avoids competing parent bindings and makes the security boundary explicit.

## Core APIs

### `ctx.tenantRuntime`

```ts
interface TenantScopeOptions {
  isolateServices?: readonly string[]
}

interface PrincipalScopeOptions {
  isolateServices?: readonly string[]
}

ctx.tenantRuntime.createTenant(tenantId, options)
ctx.tenantRuntime.get(tenantId)
```

A live tenant id may have only one runtime scope. Dispose it before recreating the same tenant.

### `ctx.multiTenant`

The v0.1 kernel remains supported:

```ts
interface TenantPrincipal {
  tenantId: string
  userId: string
}

ctx.multiTenant.claimSession(sessionId, principal)
ctx.multiTenant.canAccessSession(principal, sessionId)
ctx.multiTenant.assertSessionAccess(principal, sessionId)
```

## Explicit boundaries

This package is **not** a process/container sandbox. Cordis contexts isolate service resolution and lifecycle, not arbitrary same-process code. A trusted plugin can still reach process globals, filesystem, network, environment variables, or deliberately walk to `ctx.root`.

Strong process/filesystem/network/shell isolation belongs to deployment boundaries such as one tenant per container/Pod.

v0.2 RC1 also does **not** claim that every existing DSH plugin is automatically tenant-aware. Providers must be compatible with being instantiated below a tenant context. Known example from the reviewed current upstream: the DSH MCP client reserves `serverName` against `ctx.root`, so identical server names across tenant-local MCP instances still require an upstream/provider change or unique names. That is an ecosystem compatibility gap, not something this package hides with a second registry.

The package also does not provide billing, organization UI, a general RBAC framework, or a full HTTP/WebSocket authentication transport. An authenticated boundary must select/create the correct tenant/principal context before driving DSH work.

## Install

Prereleases use the `next` dist-tag:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

The bundle installs three deployment-global rows:

- `ctx.tenantSessionStore` — in-memory reference provider;
- `ctx.multiTenant` — persistent ownership/authorization kernel;
- `ctx.tenantRuntime` — context-native tenant runtime manager.

Production deployments should replace the in-memory ownership store with a durable provider.

## Release verification

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

The release gates cover package invariants, typecheck, unit/contract tests, packed external-consumer smoke, and the pinned DSH runtime probes.

## License

MIT
