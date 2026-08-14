# dsh-multi-tenant

Multi-tenant SaaS extension for DeepSeek Harness (DSH): tenant identity,
session ownership, authorization boundaries, tenant-aware MCP, and audit.

> **Status: early development / architecture bootstrap.** This repository
> implements the multi-tenant **core contract** only. It is **not** a complete
> SaaS security solution — see [What this core is not](#what-this-core-is-not).

---

## What this core does

Given an authenticated `TenantPrincipal`, `dsh-multi-tenant` owns and authorizes
access to opaque DSH session ids through a fail-closed, durable-store-compatible
ownership contract.

Concretely, it provides a single Cordis service, `ctx.multiTenant`, that:

- **abstracts the authenticated principal** (`TenantPrincipal`),
- **owns sessions** with claim-once, immutable ownership,
- **enforces the tenant boundary** unconditionally (no role crosses it),
- **authorizes fail-closed** (unknown and foreign sessions are both denied),
- **defines a storage seam** (`TenantSessionStore`) so ownership persistence can
  move to a durable store without a breaking API change.

## What this core is not

- ❌ Authentication / HTTP transport (no JWT, cookies, web login)
- ❌ Transport authorization / WebSocket filtering / `events.mux` / `events.host`
- ❌ MCP client or tenant-aware MCP credential pooling
- ❌ Downstream data isolation / ERP token
- ❌ Audit persistence
- ❌ UI / billing / dashboards
- ❌ An RBAC / role-policy framework

These are all on the [roadmap](#roadmap). The core is the middle of the future
chain:

```text
Authenticated Transport
        ↓
TenantPrincipal
        ↓
dsh-multi-tenant Core          ← this repository (Principal + Ownership + Authorization)
        ↓
Session ACL
        ↓
Tenant-aware MCP / business credentials
        ↓
Downstream tenant validation
```

## Architecture

```text
Browser / SaaS client
        |
        | authenticated identity
        v
Tenant-aware connection / API boundary
        |
        | TenantPrincipal
        v
Session authorization
        |
        +---------------------+
        |                     |
        v                     v
Shared DeepSeek Harness   Tenant-aware MCP
Agent Loop / LLM / Tools  credential pool
        |
        v
Session persistence
        |
        v
Audit / usage store
```

## Design principles

- **Shared runtime, logical isolation** — one Harness process, many tenants,
  separated by authorization rather than by process or fork.
- **Fail closed** — unknown sessions and unauthenticated identities are denied.
- **Identity is server-derived** — `TenantPrincipal` comes from the
  authenticated boundary, never from a client-supplied field.
- **Claim-once ownership** — a session's owner is immutable; a conflicting
  claim is denied, never overwritten.
- **Streams are authorization surfaces** — sessions, RPC, and tool/MCP streams
  are each a boundary, not just the HTTP entry point.
- **Defense in depth** — this core is one layer; it does not replace the
  authenticated boundary or downstream tenant validation.
- **Prefer plugins over forks** — build on DSH's public plugin/service seams.

## Install

```sh
dsh plugin --profile web add github:GuoMonth/dsh-multi-tenant
```

The package declares [`dsh.bundle`](./package.json), so this appends its patch
layer to the profile and mounts `ctx.multiTenant`.

## Core API

### Types

```ts
interface TenantPrincipal {
  tenantId: string
  userId: string
  roles: readonly string[]
}

interface SessionOwner {
  tenantId: string
  userId: string
}
```

### `TenantSessionStore` (service seam, `ctx.tenantSessionStore`)

The storage seam is a Cordis **Service**, not a plain interface: it is provided
by a backend plugin and consumed by `MultiTenantService`. `claim` is **atomic**
(single operation, not get-then-set) so a durable backend can map it to
`INSERT … ON CONFLICT`:

```ts
type ClaimResult = 'created' | 'idempotent' | 'conflict'

abstract class TenantSessionStore extends Service {
  claim(sessionId: string, owner: SessionOwner): Promise<ClaimResult>
  get(sessionId: string): Promise<SessionOwner | undefined>
}
```

There is deliberately **no release/delete** in the v0 contract: ownership is
claim-once and immutable. `InMemoryTenantSessionStore` is the default provider —
a process-local `Map`, intended for **development/bootstrap only**, not
production persistence. A future durable backend swaps the `tenantSessionStore`
provider without touching `MultiTenantService`.

### `MultiTenantService` (`ctx.multiTenant`)

Consumes `ctx.tenantSessionStore` (declared via `static inject`). All methods are
async so a durable store can be adopted without a breaking change.

| Method | Semantics |
| --- | --- |
| `claimSession(sessionId, principal)` | Claim-once. Unclaimed → success; same owner → idempotent; different owner → `SessionOwnershipConflictError`. |
| `getSessionOwner(sessionId)` | Trusted-facing lookup; returns the owner or `undefined`. |
| `canAccessSession(principal, sessionId)` | Fail-closed boolean. Same tenant + same owner → `true`; else `false`. |
| `assertSessionAccess(principal, sessionId)` | Like above, but throws a uniform `SessionAccessDeniedError`. |

Authorization semantics:

- **Unknown session** → denied.
- **Tenant mismatch** → denied (unconditional; checked before anything else).
- **Same tenant, different user** → denied (ownership only; no RBAC yet).
- **Same tenant, same user** → allowed.

Identifiers (`sessionId`, `tenantId`, `userId`) are **opaque**: the core never
parses a tenant id out of a session id, never uses prefix-based authorization,
and never assumes UUID/numeric shapes — only opaque exact-match identity.

## Error privacy

`assertSessionAccess` throws a single, non-enumerating `SessionAccessDeniedError`
(`"Access to session denied."`). Unknown sessions and foreign sessions are
indistinguishable, and the error never carries the owner's tenant or user id.
Internal diagnostic reasons (`UNKNOWN_SESSION`, `TENANT_MISMATCH`,
`USER_MISMATCH`) exist for tests/audit/observability but are not part of the
public authorization result.

## Security boundary

Cordis / DSH **scope** is a *composition and visibility* mechanism — service
isolation and dependency wiring. It is **not** by itself a multi-tenant security
boundary.

A production deployment must enforce isolation across layers:

```text
authenticated request boundary
        +
session ACL                          ← this core
        +
tenant-aware MCP / business token
        +
downstream ERP / business API tenant validation
```

Do not treat the in-memory store or the Cordis scope as the security perimeter.

## Roadmap

- [x] project bootstrap
- [x] `TenantPrincipal` / `SessionOwner`
- [x] claim-once session ownership
- [x] fail-closed core authorization
- [x] `TenantSessionStore` seam (in-memory)
- [x] runtime invariant validation
- [x] Loader integration test
- [ ] durable `TenantSessionStore` (PostgreSQL / MySQL / Redis / remote)
- [ ] HTTP principal/auth integration
- [ ] session RPC authorization
- [ ] WebSocket mux filtering
- [ ] approval/question RPC ownership
- [ ] tenant-aware MCP
- [ ] token usage / audit
- [ ] DSH Web integration tests
- [ ] npm prerelease

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

- `build` runs `tsdown`, emitting `dist/index.mjs` + `dist/index.d.mts`.
- `typecheck` runs `tsc --noEmit`.
- `test` runs unit, security, and a real Cordis Loader integration test.

## License

MIT
