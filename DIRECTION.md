[简体中文](./DIRECTION.zh-CN.md) | English

# Direction

`0.3` is the current product line. The live tree serves the current product rather than preserving prerelease archaeology.

## Current baseline — 0.3.0-rc.2 First Product Experience

`0.3.0-rc.2` turns the proven multi-tenant Runtime into a directly usable product-facing MVP:

```text
existing JWT / Cookie / req.user
        ↓ product-owned authentication
TrustedSubject
        ↓
canonical Tenant / Principal
        ↓
Tenant MCP config + Principal credentials
        ↓
Principal-aware Agent create/resume
        ↓
real DSH Agent + official MCP client
        ↓
native MCP Tool
        ↓
visible identity / Session isolation
```

The release adds a runnable real-DSH-Web starter, a thin Web identity/admission bridge, an MCP-specific product facade and secret-safe first-use diagnostics. The permanent FPE probe exercises the installed candidate through a real DSH Web profile and real MCP Tool call.

## What happens next

The next priority is **real product usage**, not another architecture milestone. Consume `0.3.0-rc.2`, integrate real existing authentication/MCP systems, and use that evidence to decide which gap deserves the next breaking or additive change.

Current candidates include:

- product Principal authority through stock DSH Web RPC dispatch (tracked in #41);
- production Redis/SQL Session persistence;
- real JWT/Cookie integration feedback and token lifecycle pressure;
- a second ERP/direct-business-API vertical slice;
- repeated authority/refresh/injection/audit semantics that may finally justify a Broker / `Capability-as-Authority` contract;
- Permission/Audit capabilities when actual products require them.

No candidate is predeclared as the next release milestone. Evidence decides priority.

## Current boundaries

`0.3.0-rc.2` intentionally does not claim:

- that every stock DSH Web RPC is automatically tenant-authorized by the product bridge;
- hostile-code/process/filesystem/network isolation inside one shared process;
- production durability from the in-memory reference Session store;
- a universal OAuth/OIDC/token-refresh or Credential Broker framework;
- MCP Resources/Prompts beyond the pinned Harness consumer seams.

Strong process isolation remains a process/container/Pod concern. Product authentication remains product-owned.

## Live tree policy

- Keep current code, contracts, evidence and release machinery.
- Remove completed release-scope documents and old release notes from the active tree; Git history/tags preserve them.
- Do not keep one-shot probes/workflows after their conclusions become permanent evidence.
- Add packages/abstractions only after real vertical slices prove independent value.

## Long-term principle

> **Core owns identity/lifecycle; Broker owns authority/secrets; Integration owns vendor protocol; Operation consumes typed abilities; secrets stay behind the authority boundary whenever practical.**

That remains a direction, not a promise to introduce a universal Broker before real integrations earn it.

See [`docs/vision/authority-capabilities.md`](./docs/vision/authority-capabilities.md).
