# dsh-multi-tenant

Multi-tenant SaaS extension for DeepSeek Harness (DSH): tenant identity,
session ownership, authorization boundaries, tenant-aware MCP, and audit.

> **Status: early development / architecture bootstrap.** This repository
> establishes the plugin skeleton and the multi-tenant *core abstractions*. It
> is **not** yet a production security boundary — see
> [Security boundary](#security-boundary).

---

## What this is

`dsh-multi-tenant` is a [Cordis](https://github.com/cordiverse/cordis) plugin
for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that
provides a single service, `ctx.multiTenant`, which owns the mapping between
DSH sessions and the tenant/user that may access them. The goal is to let one
shared Harness runtime host many tenants with **logical isolation** — without
forking Harness and without patching `node_modules`.

This first milestone ships only the core: identity types, session ownership,
and fail-closed authorization. Everything else is on the
[roadmap](#roadmap).

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
- **Fail closed** — unknown sessions and unauthenticated identities are denied
  by default.
- **Identity is server-derived** — a `TenantPrincipal` comes from the
  authenticated request boundary, never from a client-supplied field.
- **Explicit session ownership** — every session has one recorded owner; access
  requires matching that owner (or a future elevated role).
- **Streams are authorization surfaces** — sessions, RPC, and tool/MCP streams
  are each an authorization boundary, not just the HTTP entry point.
- **Tenant-aware tool execution** — tool and MCP access is scoped per tenant.
- **Defense in depth** — this plugin is one layer; it does not replace the
  authenticated boundary or downstream tenant validation.
- **Prefer plugins over forks** — build on DSH's public plugin/service/event
  seams; do not fork Harness.

## Install

```sh
dsh plugin --profile web add github:GuoMonth/dsh-multi-tenant
```

This installs the package and, because it declares
[`dsh.bundle`](./package.json), appends its patch layer to the profile. The
bundle inserts one Cordis row that mounts this service.

> A git install fetches sources, not built artifacts, so the package ships a
> `prepare` script that builds `dist/` after install. pnpm ≥10 requires the
> build to be allow-listed the first time — copy the exact package key pnpm
> prints into the profile's `pnpm-workspace.yaml` under `allowBuilds`, then
> re-run the `add`.

## Usage

```ts
import { Context } from '@deepseek-ai/cordis'
import MultiTenantService, { type TenantPrincipal } from 'dsh-multi-tenant'

const ctx = new Context()
await ctx.plugin(MultiTenantService)

const principal: TenantPrincipal = {
  tenantId: 'acme',
  userId: 'alice',
  roles: ['member'],
}

ctx.multiTenant.bindSession('session-42', principal)

ctx.multiTenant.canAccessSession(principal, 'session-42') // true
ctx.multiTenant.assertSessionAccess(principal, 'session-42') // ok

ctx.multiTenant.unbindSession('session-42')
```

## Core API

### `TenantPrincipal`

```ts
interface TenantPrincipal {
  tenantId: string
  userId: string
  roles: readonly string[]
}
```

### `SessionOwner`

```ts
interface SessionOwner {
  tenantId: string
  userId: string
}
```

### `MultiTenantService` (provided as `ctx.multiTenant`)

| Method | Description |
| --- | --- |
| `bindSession(sessionId, principal)` | Record the owning tenant/user for a session. |
| `getSessionOwner(sessionId)` | Return the recorded owner, or `undefined`. |
| `canAccessSession(principal, sessionId)` | Fail-closed boolean authorization. |
| `assertSessionAccess(principal, sessionId)` | Like `canAccessSession`, but throws. |
| `unbindSession(sessionId)` | Forget the ownership binding. |

Authorization semantics:

- **Unknown session** → denied (`UnknownSessionError`).
- **Tenant mismatch** → denied (`SessionAccessDeniedError`).
- **Same tenant, same user** → allowed.
- **Same tenant, different user** → denied by default; the `canElevatedAccess`
  extension point is where a future `tenant-admin` / `platform-admin` rule
  would grant cross-user access.
- `sessionId` is an **opaque identifier**; the service never parses a tenant id
  out of it, and never trusts a client-provided tenant id.

## Scope of this milestone

Implemented (in-memory, development bootstrap):

- project skeleton matching the DSH bundle/plugin contract
- `TenantPrincipal` / `SessionOwner`
- `ctx.multiTenant` Cordis service
- fail-closed core authorization
- unit tests + bundle-contract test

Explicitly **not** implemented yet:

- Web HTTP authentication
- WebSocket filtering / mux
- API-proxy replacement
- MCP connection pool
- database persistence
- UI
- audit backend

## Security boundary

Cordis / DSH **scope** is a *composition and visibility* mechanism — service
isolation and dependency wiring. It is **not** by itself a multi-tenant
security boundary.

A production deployment must enforce isolation across multiple layers:

```text
authenticated request boundary
        +
session ACL
        +
tenant-aware MCP / business token
        +
downstream ERP / business API tenant validation
```

This plugin provides the **session ACL** layer and the extension points for the
others. Do not treat the in-memory store or the Cordis scope as the security
perimeter.

## Roadmap

- [x] project bootstrap
- [x] `TenantPrincipal`
- [x] session ownership
- [x] fail-closed core authorization
- [ ] durable `TenantSessionStore`
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
- `test` runs the Vitest suite.

## License

MIT
