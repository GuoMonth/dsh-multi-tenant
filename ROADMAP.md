[简体中文](./ROADMAP.zh-CN.md) | English

# Roadmap — v0.2 Multi-Tenant Runtime

Status: ✅ done · 🚧 current · 🤝 ecosystem/upstream · 🧭 next · ⛔ boundary.

## Version-line policy

### v0.1 — frozen

Published v0.1 tags are frozen. They define the authorization kernel only:

- minimal `TenantPrincipal`;
- immutable session ownership;
- fail-closed authorization;
- replaceable `TenantSessionStore` contract.

No new feature work belongs on v0.1. Security fixes may be documented/backported only when necessary; runtime expansion belongs on v0.2.

### v0.2 — current

Goal: **make DeepSeek Harness a real Multi-Tenant Runtime**.

Current release candidate: `0.2.0-rc.1`.
Executable DSH compatibility target for this PR: `0.1.0-rc.7` (the repository's proven lockfile closure). Current upstream `0.1.1-rc.2` scope behavior has been reviewed; dependency upgrade is a separate follow-up.

## Architecture contract

The runtime has distinct planes rather than one overloaded tenancy mechanism.

| Plane | Owner | Purpose |
| --- | --- | --- |
| Persistent authorization | `ctx.multiTenant` + `TenantSessionStore` | Session ownership invariant; always fail closed. |
| Tenant capability graph | Cordis Context service isolation | Tenant-local auth/MCP/credential/provider instances and lifecycle. |
| Principal capability graph | Cordis Context service isolation | User-local OAuth/credential/policy providers below a tenant. |
| Agent/Preset registration view | DSH `@deepseek-ai/dsh-scope` | Tools, prompts, listeners and model-facing registration visibility. |
| Strong runtime isolation | Deployment/container/K8S | Process, filesystem, shell, network and memory boundaries. |

The Tenant Runtime must not create a second DI/service registry keyed by tenant id. Cordis Context is the dependency scope.

## ✅ R0 — v0.1 kernel retained

The v0.1 security kernel remains intact inside v0.2. `multiTenant`, `tenantSessionStore`, `tenantRuntime`, and Cordis core services are reserved shared services and cannot be isolated out of a tenant graph.

## 🚧 R1 — Context-native runtime (`0.2.0-rc.1`)

Deliver the first executable runtime primitive:

- `ctx.tenantRuntime`;
- canonical live Tenant Context per tenant id;
- Principal Context below Tenant Context;
- explicit `isolateServices` capability selection;
- contextual `tenantIdOf(ctx)` / `principalOf(ctx)` metadata;
- structural Cordis lifecycle disposal;
- duplicate tenant graph rejection;
- cross-tenant principal binding rejection;
- two-tenant adversarial tests;
- packed external-consumer runtime smoke;
- retain the proven RC7 executable compatibility closure while validating the architecture against current upstream scope behavior.

Exit criteria: all repository release gates pass and the packed package proves independent same-name service resolution for two tenants while sharing the ownership kernel.

## 🤝 R2 — Provider compatibility contracts

A Context can isolate only capabilities whose providers respect Context/service scope. Inventory real DSH providers and classify them:

1. **Context-safe** — may be instantiated below a Tenant/Principal Context as-is.
2. **Needs scoped global-state fix** — provider uses `ctx.root`, module singleton, global Map/Set, env, or another deployment-global identity.
3. **Host-global by design** — should not become tenant-local; expose a safe tenant-facing facade instead.

First known gap in the reviewed current upstream: DSH MCP client reserves `serverName` per `ctx.root`. Propose the smallest upstream/provider change that makes namespace ownership scope-aware without forking MCP runtime.

Target capability families:

- Auth/session identity provider;
- MCP connections and credentials;
- credential/token store;
- tenant configuration/secrets;
- storage/workspace adapters where applicable;
- model/provider policy where tenant-local instances are useful.

## 🧭 R2.5 — DSH dependency refresh

Upgrade the complete DSH package graph and `pnpm-lock.yaml` from the proven RC7 closure to a current release in a dedicated change. Do not couple that dependency-resolution churn to the v0.2 architecture PR.

## 🤝 R3 — Authenticated transport → Context binding

Define the production boundary as:

```text
HTTP request / WebSocket connection
        ↓ authenticate
TenantPrincipal
        ↓ resolve/create
Tenant Context / Principal Context
        ↓
DSH work driven from that context
```

Do not spread `tenantId` parameters through every provider when Context can carry the dependency graph. Explicit identity remains mandatory at wire, durable, worker and authorization boundaries.

Required proof:

- concurrent Tenant A/B requests do not cross-talk;
- WebSocket lifetime keeps the correct Principal Context;
- no client field can choose a trusted tenant/principal identity;
- session publication/lookup still passes the ownership kernel.

## 🧭 R4 — Agent integration

Integrate Tenant/Principal Context with DSH agent creation without competing with the existing Agent/Preset scope-parent chain.

Preferred direction:

- create/drive an Agent from a Tenant/Principal-derived Cordis context;
- let DSH `agent.ctx` continue to own Agent-local registration lifecycle;
- keep Preset standing-scope ancestry untouched;
- define exactly which tenant-scoped services Agent creation inherits.

## 🧭 R5 — Production providers

Demand-driven, independently replaceable packages/providers:

- durable ownership store (PostgreSQL/MySQL/Redis where justified);
- reference auth/context binder;
- tenant credential provider;
- MCP tenant adapter after upstream namespace/global-state gaps are resolved;
- audit/usage provider.

These should compose as a plugin family rather than make the core runtime depend on one SaaS stack.

## ⛔ Explicit boundaries

Cordis Context is not a hostile-code sandbox. It does not isolate:

- process memory/globals;
- filesystem/shell;
- network;
- environment variables;
- arbitrary malicious/trusted plugin code that deliberately escapes to `ctx.root` or process APIs.

Deployments requiring strong tenant isolation should use a separate process/container/Pod boundary. Billing, organization UI, general RBAC and product-specific user management remain outside this repository's core contract.