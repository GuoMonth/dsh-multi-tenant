[简体中文](./web-seam-map.zh-CN.md) | English

# DSH Web Multi-Tenant Seam Map — historical research

This document preserves the earlier Web/API authorization investigation. It is **not the current transport architecture authority**. v0.3 transport design starts from the canonical Tenant/Principal Runtime Contract in [`architecture.md`](./architecture.md).

## Historical source

The original seam map was based on DeepSeek Harness commit:

`47f943859bef60e4160492346772ded9b24f765a`

It established several reusable enforcement ideas:

| Surface shape | Useful enforcement idea |
| --- | --- |
| Session-keyed point RPC | Guard ownership before dispatch. |
| Collection RPC | Filter only when post-filter semantics remain correct. |
| Create/resume | Admit before publication through Agent setup. |
| Streams/respond/global surfaces | Deny until an explicit tenant resource/correlation model exists. |

These ideas remain useful, but the old spike's transport model is no longer the target architecture.

## What changed architecturally

v0.2 introduced a canonical runtime hierarchy:

```text
Tenant -> Principal -> derived integration fiber -> DSH operation
```

The future authenticated transport path should therefore be:

```text
HTTP / WebSocket / other wire boundary
        ↓ authenticate explicit identity
TenantPrincipal
        ↓ resolve canonical Tenant/Principal
Principal Runtime
        ↓ derive operation fiber + explicit inject
DSH API / Agent operation
```

Transport identity is explicit at the security boundary; capability/lifecycle scope comes from the canonical Principal Runtime. This is preferable to attaching `tenantId` parameters to every downstream API or keeping a Web-specific tenant registry.

## Current status of the old Web package

`packages/multi-tenant-web` remains private and preserves:

- real `ApiProxy` experiments;
- exhaustive DSH unary API classification;
- fail-closed guard/filter/deny research.

It is a research/compatibility package, not a production v0.3 framework layer. Code is reusable only when it fits the current runtime structure without compatibility shims or parallel state.

## Current evidence

The admission-before-publication part of the original map is now executable CI evidence through `scripts/admission-decorator-probe.mjs` against the exact DSH baseline (`0.1.1-rc.2`).

Current DSH compatibility policy: [`../reference/compatibility.md`](../reference/compatibility.md).
Current product direction: [`../../ROADMAP.md`](../../ROADMAP.md).
