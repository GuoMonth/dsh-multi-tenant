[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Multi-tenant kernel primitives for DeepSeek Harness (DSH): tenant identity,
immutable session ownership, fail-closed authorization, and a replaceable
ownership-store contract.

> **Release candidate: `0.1.0-rc.1`.** This package is intentionally small. It
> is the only publishable artifact in the first 0.1 release line; Web/auth/MCP/
> runtime isolation are separate integration or ecosystem concerns. The current
> DSH compatibility target is `0.1.0-rc.7`.

## Supported guarantee

Given an authenticated `TenantPrincipal`, this package owns and authorizes access
to opaque DSH session ids through a fail-closed ownership contract.

It provides two Cordis services:

- `ctx.tenantSessionStore` — the replaceable ownership-storage seam;
- `ctx.multiTenant` — claim-once ownership and authorization.

The kernel guarantees:

- **claim-once, immutable ownership**;
- **unconditional tenant boundary** — no role can cross tenants;
- **same-user ownership in v0.1** — same tenant but different user is denied;
- **fail-closed authorization** — unknown and foreign sessions are denied;
- **non-enumerating public denial** — unknown vs foreign is not disclosed;
- **async storage contract** so a durable provider can replace the in-memory
  reference without changing the kernel API.

## Explicit boundaries

This package is **not**:

- an authentication or HTTP/WebSocket transport layer;
- a production multi-user DSH Web integration;
- a durable database provider (the bundled in-memory provider is bootstrap/dev);
- an MCP credential/context implementation;
- an audit/usage store;
- process, shell, filesystem, container, credential, or network isolation;
- billing, UI, organization/user administration, or a general RBAC framework;
- a team-sharing/ACL/reassignment model.

Those items are not all “future kernel features”. The project rule is:
**control → enforce, ecosystem → standardize, outside control → bound**.

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

### `TenantSessionStore` (`ctx.tenantSessionStore`)

The storage seam is a Cordis `Service`. `claim` is one atomic contract operation
so durable providers can implement it with their native conditional-write
primitive.

```ts
type ClaimResult = 'created' | 'idempotent' | 'conflict'

abstract class TenantSessionStore extends Service {
  claim(sessionId: string, owner: SessionOwner): Promise<ClaimResult>
  get(sessionId: string): Promise<SessionOwner | undefined>
}
```

There is deliberately no release/reassign API in the 0.1 contract. Ownership is
immutable. `InMemoryTenantSessionStore` is the reference provider and is intended
for tests/bootstrap, not production durability.

Third-party providers should run the shared contract suite exported from
`dsh-multi-tenant/testing`.

### `MultiTenantService` (`ctx.multiTenant`)

| Method | Semantics |
| --- | --- |
| `claimSession(sessionId, principal)` | Unclaimed → create; same owner → idempotent; other owner → conflict. |
| `getSessionOwner(sessionId)` | Trusted-facing owner lookup. |
| `canAccessSession(principal, sessionId)` | Fail-closed boolean authorization. |
| `assertSessionAccess(principal, sessionId)` | Same policy, throwing a uniform `SessionAccessDeniedError` on denial. |

Authorization is exact-match and opaque: the kernel never parses tenant identity
from a session id and never authorizes by prefix.

## Error privacy

`assertSessionAccess` exposes one non-enumerating denial. Unknown sessions and
foreign sessions are intentionally indistinguishable to callers; owner tenant or
user identity is never included in the public error.

## Install / composition

The first npm prerelease is published on the **`next`** dist-tag, not `latest`.
After R3 publishes it, install into a DSH profile with:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

The package declares `dsh.bundle`; DSH therefore adds its bundle layer to the
profile. The bundled layer mounts the in-memory `tenantSessionStore` reference
and the `multiTenant` service. A deployment that needs durability should replace
the store provider rather than modify the kernel.

## Release verification

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` covers package/architecture invariants, release-manifest
preflight, typecheck, unit/contract tests, build, a packed external-consumer
smoke test, and the RC7 DSH runtime proofs. See
[`docs/reference/release.md`](../../docs/reference/release.md).

Production Web principal binding, durable providers, auth providers, search,
MCP, audit, and deployment recipes are independent follow-ups. See
[`ROADMAP.md`](../../ROADMAP.md).

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT
