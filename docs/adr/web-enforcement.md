[简体中文](./web-enforcement.zh-CN.md) | English

# ADR — Web/API tenant enforcement research

> Status: **historical enforcement findings accepted; old transport architecture superseded by v0.2 Runtime Contract / v0.3 SaaS composition**.

## Accepted findings

The earlier Web spike established several durable rules that remain useful regardless of transport implementation:

1. session-keyed point operations require ownership guard before dispatch;
2. collection filtering is valid only when post-filter semantics remain correct;
3. create/resume ownership or admission must happen before publication, not after `session/created`;
4. unmodelled deployment-global surfaces remain denied until a tenant resource model exists;
5. exhaustive API classification is valuable because new DSH methods should not silently bypass policy.

`packages/multi-tenant-web` preserves the real `ApiProxy` experiments and compile-time exhaustive unary classification as private research evidence.

## What is superseded

The old ADR framed production progress around adding a request/connection principal seam directly to the Web spike and then growing the spike into a production enforcement plane.

That is no longer the architectural direction.

v0.2 introduced a canonical Tenant/Principal Runtime, so v0.3 authenticated transport should be designed from the runtime structure outward:

```text
wire request / connection
        ↓ authenticate explicit identity
TenantPrincipal
        ↓ resolve canonical runtime
Tenant -> Principal
        ↓ derive operation fiber
explicit Cordis inject
        ↓
DSH API / Agent operation
```

Transport is therefore an integration/provider layer over the Runtime Contract, not a second tenant runtime.

## Boundary ownership

The transport/security boundary must explicitly authenticate identity; client-supplied tenant/user fields are not trusted merely because they exist in a payload.

After identity is established, the canonical Principal Runtime owns same-process capability/lifecycle context. The operation fiber injects only the services needed for that request/connection/Agent action.

Persistent session ownership still goes through `ctx.multiTenant`; contextual identity never replaces durable authorization.

## Reuse of Web spike code

Existing Web code may be reused when it naturally fits the v0.3 structure:

- `ApiProxy` exhaustive method classification;
- guard/filter/deny policy mechanics;
- fail-closed handling of unknown/global surfaces;
- tests that prove cross-tenant visibility restrictions.

Do not preserve old code by adding compatibility shims, global ambient principal state or a parallel tenant registry. If a clean v0.3 transport adapter is simpler and semantically stronger, replace the spike.

## Current evidence

- Agent/session publication seam: [`../specs/session-genesis-map.md`](../specs/session-genesis-map.md)
- Agent setup composition: [`../specs/admission-composition.md`](../specs/admission-composition.md)
- historical Web seam map: [`../specs/web-seam-map.md`](../specs/web-seam-map.md)
- current Runtime architecture: [`../specs/architecture.md`](../specs/architecture.md)
- current product direction: [`../../ROADMAP.md`](../../ROADMAP.md)

Exact current DSH baseline and executable probes are defined in [`../reference/compatibility.md`](../reference/compatibility.md).
