[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant-web

Private DSH Web / ApiProxy research package.

This package is **not a current production layer or release artifact**. It preserves useful enforcement experiments and compile-time DSH API-surface evidence while v0.3 redesigns authenticated transport around the canonical Tenant/Principal Runtime Contract.

`private: true` is intentional.

## Current role

The package still proves useful facts:

- the real DSH `ApiProxy` facade can be exhaustively classified at compile time;
- session-keyed operations can be guarded/fail-closed;
- collection filtering must preserve endpoint semantics rather than blindly remove foreign rows;
- unmodelled/global surfaces must remain denied until a tenant meaning is defined.

Its DSH-facing dependency is pinned to the repository-wide explicit baseline (`0.1.1-rc.2`) and checked by `pnpm verify`.

## What this package does not define

The old spike does not own the v0.3 transport architecture. In particular, production transport should not become another global `tenantId` plumbing layer or rely on an obsolete request model.

The target v0.3 structure is:

```text
HTTP / WebSocket / other wire boundary
        ↓ authenticate
TenantPrincipal
        ↓ resolve canonical runtime
Tenant -> Principal
        ↓ derive operation fiber
explicit inject of transport / agents / providers
        ↓
DSH operation
```

Identity is explicit at the wire/security boundary. Capability and lifecycle context then flow through the canonical Principal Runtime and its derived integration fiber.

## Reuse policy

v0.3 may reuse code or conclusions from this package only when they fit the new structure naturally. If the old spike requires compatibility shims, parallel registries or transport-specific exceptions to the Runtime Contract, prefer a clean replacement.

Historical Web seam analysis remains in:

- [`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md)
- [`docs/specs/web-seam-map.md`](../../docs/specs/web-seam-map.md)

Those documents are evidence from earlier investigation, not the current architecture authority. Current architecture is [`docs/specs/architecture.md`](../../docs/specs/architecture.md), and the next product direction is [`ROADMAP.md`](../../ROADMAP.md).
