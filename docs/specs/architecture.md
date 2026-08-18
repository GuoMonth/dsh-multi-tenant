[简体中文](./architecture.zh-CN.md) | English

# Architecture — six layers

The project is **one composable plugin family**, organized into six layers. The
kernel owns only the cross-suite tenant primitives; every layer above it is a
replaceable capability, and every layer below the kernel is a swappable
provider. This document is the global map the individual ADRs and Seam Maps are
anchored to.

## The six layers

| # | Layer | Artifact | Responsibility | Status |
| --- | --- | --- | --- | --- |
| ① | **Kernel** | `dsh-multi-tenant` | `TenantPrincipal` / `SessionOwner`, claim-once ownership, fail-closed authorization, the `TenantSessionStore` contract. | ✅ test-pinned, prerelease contract |
| ② | **Ownership provider** | `TenantSessionStore` impls | Persist ownership (memory / PostgreSQL / Redis / MySQL / third-party). Proven by the shared contract suite. | ✅ seam + in-memory default; durable providers deferred |
| ③ | **Genesis admission** | `ctx.agents` decorator | Join every Agent `setup`; establish / inherit / restore ownership before `sessions.enter`. | ✅ runtime-proven for create / fork / subagent / resume; transport installation pending |
| ④ | **Identity plane** | transport + auth provider | Turn an authenticated HTTP/WS request into a request/connection-scoped `TenantPrincipal`. **H3 lives here.** | ⏳ upstream requirement still to be proven by M4 transport work |
| ⑤ | **Enforcement plane** | `dsh-multi-tenant-web` | A tenant-bound `ApiProxy`: guarded session points, safe collection projection, admission gating, and fail-closed denial of unmodelled/global surfaces. Streams/respond remain M4 transport work. | 🚧 real unary `ApiProxy` + exhaustive classification done; transport pending |
| ⑥ | **Distribution / preset** | the official SaaS stack | Compose core + store + web + auth + MCP + audit, each piece replaceable. | ⏳ |

## Diagram

```mermaid
flowchart TD
    subgraph L4["④ Identity Plane"]
        direction TB
        HTTP["HTTP / WebSocket"] --> AUTH["Auth Provider<br/>(JWT / OIDC / API key)"]
        AUTH --> PRINCIPAL["Request / connection-scoped<br/>TenantPrincipal"]
    end

    PRINCIPAL -->|"create / fork / subagent / resume"| GENESIS
    PRINCIPAL -->|"guard / filter / admit"| ENFORCE

    subgraph L3["③ Genesis Admission"]
        GENESIS["AgentSetup hook<br/>establish / inherit / restore"]
    end

    subgraph L5["⑤ Enforcement Plane"]
        ENFORCE["tenant-bound ApiProxy<br/>guard / filter / admit / deny"]
    end

    GENESIS --> KERNEL
    ENFORCE --> KERNEL

    subgraph L1["① Kernel"]
        KERNEL["dsh-multi-tenant<br/>TenantPrincipal · SessionOwner<br/>ownership + fail-closed authorization"]
    end

    KERNEL --> STORE

    subgraph L2["② Ownership Provider"]
        STORE["TenantSessionStore contract"]
        STORE --> MEM["Memory"]
        STORE --> PG["PostgreSQL"]
        STORE --> REDIS["Redis"]
        STORE --> THIRD["third-party"]
    end

    subgraph L6["⑥ Distribution / Preset"]
        PRESET["official SaaS stack<br/>core + store + web + auth + MCP + audit"]
    end

    PRESET -.-> L1
    PRESET -.-> L2
    PRESET -.-> L3
    PRESET -.-> L4
    PRESET -.-> L5
```

## Request flow

1. **④ Identity** — an HTTP request or WS upgrade is authenticated; the auth
   provider (JWT / OIDC / API key) yields a `TenantPrincipal` bound to the
   request/connection scope. The kernel never sees the auth mechanism.
2. **③ Genesis** — on `create` / `fork` / `subagent` / `resume`, the admission
   decorator joins the Agent `setup` hook and establishes (create), inherits
   (fork / subagent), or restores (resume) ownership — all before
   `sessions.enter`, so there is no ownership window.
3. **⑤ Enforcement** — the tenant-bound `ApiProxy` guards session-keyed methods,
   post-filters only collections whose semantics remain correct after filtering,
   and denies unmodelled host/global surfaces. `session.create` is an admission
   operation, not ordinary allow; streams/respond stay fail-closed until M4's
   transport proof installs their complete authorization path.
4. **① Kernel** — `MultiTenantService` authorizes against `TenantSessionStore`
   (claim-once, immutable, tenant boundary unconditional).
5. **② Provider** — ownership persists to memory / PostgreSQL / Redis / … behind
   the `TenantSessionStore` contract.

## Dependency direction (one-way)

```
Kernel primitives  ◀──  capability contracts  ◀──  providers
```

- The **kernel** has **zero** transport/vendor dependencies — it never knows
  JWT / PostgreSQL / HTTP / MCP / Redis. Enforced by `scripts/verify-packages.mjs`.
- **Capability** packages (③ genesis admission, ⑤ enforcement) own their own
  contracts and may depend on the kernel's primitives.
- **Providers** (②) depend on the contract they implement; sibling capabilities
  do not reach through each other's implementations.

## H3 is a hypothesis, not a conclusion

M4 has now runtime-proven the `ctx.agents` decorator for all four genesis paths,
so admission composability is no longer a second upstream hypothesis. The
remaining hypothesis is **H3**: the real HTTP/WS transport needs a
request/connection-scoped principal binding point that lets the admission and
ApiProxy enforcement run under the correct principal without ambient shared
state. The upstream proposal is written only after M4's real transport proof;
if that proof exposes another missing seam, the proposal expands accordingly.

## Layer → doc map

| Layer | Docs |
| --- | --- |
| ① Kernel | `../README.md` core package, `./session-genesis-map.md` |
| ② Provider | `dsh-multi-tenant/testing` contract suite |
| ③ Genesis admission | `./session-genesis-map.md`, `./admission-composition.md`, `../adr/session-genesis.md` |
| ④ Identity plane | `../adr/web-enforcement.md` (H3) |
| ⑤ Enforcement | `./web-seam-map.md`, `../adr/web-enforcement.md` |
| ⑥ Preset | `../../ROADMAP.md` (M7) |
