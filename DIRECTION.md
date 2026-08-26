[简体中文](./DIRECTION.zh-CN.md) | English

# Direction

`0.3` is the current product line. The live tree serves the current product rather than preserving prerelease archaeology.

## Current candidate — 0.3.0-rc.3 Durable Local Experience

`0.3.0-rc.2` proved the first real product path. `0.3.0-rc.3` removes the next adoption friction: an individual developer should not need PostgreSQL or Docker before Session ownership survives a restart.

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
SQLite-backed immutable Session ownership
        ↓ restart-safe local development
real DSH Agent + official MCP client
        ↓
native MCP Tool
```

The shipped DSH bundle now selects `SQLiteTenantSessionStore` by default. It uses Node's built-in `node:sqlite`, writes `<cwd>/.dsh-multi-tenant/session-ownership.sqlite` unless overridden, and keeps the existing claim-once `TenantSessionStore` contract. The permanent SQLite probe launches separate Node processes and proves restart persistence plus exactly-one-winner competing claims.

SQLite is deliberately a **local durable / single-node adoption provider**. It does not turn the package into a horizontally scaled persistence product. A later PostgreSQL/other provider should plug into the same Store seam when real deployment evidence requires it.

## Acknowledged Web boundary — #41

The project accepts the current pinned-DSH limitation: stock DSH Web RPC dispatch does not materialize a product-authenticated Principal Context for every business method.

That is no longer treated as a blocker for the product path. Until upstream exposes a request-scoped Principal seam, the production deployment contract is:

```text
Browser / external client
        ↓
Product Gateway / BFF
  - authenticate
  - resolve canonical Tenant / Principal
  - authorize Session / Agent resources
        ↓ private network / loopback
DSH Web + dsh-multi-tenant
```

Public clients must not have a bypass path to stock DSH `/api`. Issue #41 remains open as an upstream/native integration improvement, not as a hidden claim that rc.3 already protects every stock RPC in-process.

## What happens next

After rc.3, priority stays evidence-driven. The most likely product gaps are:

- real credential refresh / rotation / revocation pressure for long-lived Principal-owned Agents;
- production Gateway/BFF examples and executable deployment evidence around the acknowledged #41 boundary;
- a second ERP/direct-business-API vertical slice;
- PostgreSQL or another multi-instance `TenantSessionStore` when actual deployments need horizontal scaling;
- minimal audit/policy hooks when real products need them;
- repeated authority/refresh/injection/audit semantics that may eventually justify a Broker / `Capability-as-Authority` contract.

Do not introduce a universal Auth/Broker/Policy framework merely to make the architecture look complete.

## Current boundaries

`0.3.0-rc.3` intentionally does not claim:

- that every stock DSH Web RPC is automatically tenant-authorized by the product bridge;
- multi-replica production durability from the bundled SQLite provider;
- hostile-code/process/filesystem/network isolation inside one shared process;
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