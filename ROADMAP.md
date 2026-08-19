[简体中文](./ROADMAP.zh-CN.md) | English

# Roadmap — converge for the first release

Statuses: ✅ done · 🚧 release-blocking · 🤝 ecosystem · 🧭 later / demand-gated · ⛔ explicit boundary.

## Release target

The next goal is **not** a complete multi-tenant SaaS distribution. It is a small,
useful, honest first release of the kernel line:

- **`dsh-multi-tenant`** — first public **0.1 prerelease** (proposed
  `0.1.0-rc.1`), targeting **DeepSeek Harness `0.1.0-rc.7`**.
- **`dsh-multi-tenant-web`** — remains an **experimental enforcement spike**.
  Its production contract is not a blocker for the kernel release because the
  missing request/connection principal scope belongs to the DSH transport
  ecosystem.

The release promise is deliberately narrow: session ownership and
fail-closed authorization on surfaces this repository controls. Anything else
is either an ecosystem contract or an explicit boundary.

## Boundary matrix

| Surface | Classification | What this project does | Blocks first kernel release? |
| --- | --- | --- | --- |
| Tenant principal / session ownership / access decisions | **Control → enforce** | Own the contract and fail closed. | **Yes** — already implemented and test-pinned. |
| `TenantSessionStore` seam + contract suite | **Control → enforce** | Own the seam; ship the in-memory reference; third parties prove providers with the shared suite. | **Yes** — already done. |
| Agent genesis admission (`setup`) | **Control → enforce** | Keep the decorator/probe; revalidate only the affected RC7 seam. | **Yes** — compatibility evidence only. |
| Unary `ApiProxy` classification | **Control → enforce** | Exhaustively classify the real `RpcMethodMap`; unknown/new methods fail closed. | **Yes** — compatibility evidence only. |
| HTTP/WS request/connection principal scope | **Ecosystem → standardize** | Specify the smallest generic DSH seam and upstream it. Do not fork/rebuild the Web transport. | **No** for kernel; **yes** for production web enforcement. |
| mux / host streams and `respond` | **Control after ecosystem seam** | Keep denied in the spike; implement/test only after a principal-scoped transport seam exists. | No for kernel. |
| Auth providers (JWT/OIDC/API key) | **Later provider** | Add a replaceable reference provider only after there is a real transport principal scope. | No. |
| Durable ownership stores | **Later provider** | Add one or more providers when there is real demand; the provider seam already exists. | No. |
| `session.search` tenant visibility | **Ecosystem / later** | Deny for now; pursue a scoped visibility/search contract only if needed. | No. |
| Workspace / host-global management | **Outside v0.1 scope** | Deny where exposed through the web spike; do not invent tenant semantics for DSH-global resources. | No. |
| Tenant-aware MCP context propagation | **Ecosystem / later** | Define a conformance contract when the DSH/MCP seam is concrete and there is demand. | No. |
| Shell / filesystem / process / container / network isolation | **Explicit boundary** | Not provided by this plugin family. Strong execution isolation belongs to the deployment/runtime layer. | No. |
| Billing, UI, organization/user administration | **Explicit boundary** | Not a goal of this repository. | No. |
| Team sharing / ACLs / ownership reassignment | **Explicit v0.1 boundary** | v0.1 keeps immutable tenant+user ownership. A separate same-tenant access policy may be designed later. | No. |

## Done

- ✅ **M0 — Engineering foundation** — monorepo, package rules, spec/ADR discipline, CI.
- ✅ **M1 — Kernel hardening** — claim-once ownership, fail-closed access,
  `TenantSessionStore`, shared contract tests, package smoke, architecture gates.
- ✅ **M2 — Session genesis proof** — Agent `setup` is the before-visibility
  admission point; create / fork / subagent / resume are covered by the RC6
  runtime proof.
- ✅ **M3 — Web enforcement spike** — real `ApiProxy` facade, exhaustive unary
  classification, fail-closed policy, and the H3 transport gap identified.
- ✅ **Boundary policy** — control → enforce; ecosystem → standardize; outside
  control → bound. RC7 is the current target baseline.

## Release track — the next few iterations

Only these steps block the first `dsh-multi-tenant` release.

### 🚧 R1 — RC7 compatibility refresh

A focused compatibility PR, not a feature PR:

1. bump the DSH dev/test pins that participate in the proofs from RC6 to
   **`0.1.0-rc.7`** and refresh the lockfile;
2. rerun the admission/runtime probe and the real `RpcMethodMap` type/test
   coverage against RC7;
3. record the exact RC7 evidence commit/version in the compatibility docs;
4. if an affected seam changed, adapt the smallest owned layer only. Do **not**
   redesign unchanged layers and do not build a replacement Web carrier merely
   to close H3 locally.

### 🚧 R2 — Kernel release hardening

1. keep package metadata aligned with the actual kernel scope — identity,
   ownership, authorization, store seam/testing; no claims of built-in MCP,
   audit, auth, or production Web isolation;
2. publish clear **supported guarantees** and **explicit boundaries** in the
   README/package docs;
3. run the existing release gates: `pnpm verify`, `pnpm typecheck`, `pnpm test`,
   `pnpm build`, and `pnpm smoke`;
4. choose the first 0.1 prerelease version (recommended `0.1.0-rc.1`) and verify
   the packed consumer experience.

### 🚧 R3 — Publish the kernel prerelease

- publish/tag the `dsh-multi-tenant` 0.1 prerelease;
- release notes name the RC7 evidence baseline and the security boundary;
- `dsh-multi-tenant-web` is **not** presented as a production multi-user Web
  solution. It may remain repository-only or be published only with an explicit
  experimental/prerelease label.

After R3, the project has a real version users and ecosystem authors can build
against without waiting for every SaaS concern to be solved.

## Ecosystem track — important, but non-blocking for the kernel

### 🤝 E1 — DSH principal-scope seam

RC7 still exposes `ConnectionRpcHandler` as decoded
`(endpoint, payload, signal)` and the Web carrier documents that it has no
authentication layer. The required deliverable from this repository is therefore
**a small generic upstream seam**, not a local transport fork.

The proposal should remain tenant-agnostic and enable a caller to derive a
request/connection-scoped API/security context from the real HTTP request / WS
upgrade. Conformance expectations should cover:

- HTTP request scope and WebSocket connection lifetime;
- concurrent principals with no ambient/global cross-talk;
- the ability to install a principal-bound `ApiProxy` before `session.create`
  admission and before event delivery;
- safe correlation for server-request responses (`respond`) if real runtime
  evidence shows it is needed.

This proposal does **not** block the kernel release.

### 🤝 E2 — Production Web enforcement, after the seam exists

Once DSH exposes an adequate principal-scope seam:

1. turn `dsh-multi-tenant-web` from a spike into an installable enforcement
   plugin;
2. wire admission, unary guards/filtering, stream filtering, and `respond` under
   the same principal scope;
3. add a minimal two-tenant adversarial E2E suite for the supported Web
   surfaces;
4. only then freeze the Web package's public contract and consider a Web
   prerelease.

### 🤝 E3 — Additional ecosystem contracts, only on demand

These are independent follow-ups, not a serial M6/M7/M8 chain:

- tenant-scoped search visibility;
- tenant-aware MCP principal/context propagation;
- any DSH-global resource model that the ecosystem actually decides to make
  tenant-owned.

Each starts with a seam/contract and conformance expectation, not a large local
implementation.

## Later owned providers — optional, independent packages

🧭 These can be built after the kernel release without changing the kernel:

- a durable `TenantSessionStore` provider (PostgreSQL / Redis / MySQL — choose
  based on contributor/user demand, not roadmap symmetry);
- a reference auth provider after E1 lands;
- lifecycle/admin cleanup for tombstoned ownership if a real use case requires
  it.

None is required to prove the kernel contract.

## Explicit boundaries / non-goals

⛔ The 0.1 line does **not** claim to provide strong process/container isolation.
A tenant-authorized Agent may still have whatever shell/filesystem/network
capabilities the surrounding DSH deployment grants it. Deployments requiring
strong execution isolation must enforce that outside this plugin family.

⛔ This repository does not become a billing system, organization/user directory,
UI product, or general RBAC framework.

⛔ It does not reimplement the DSH Web transport, session search engine, MCP
runtime, or host resource model simply to make every checklist row local.

⛔ v0.1 ownership is immutable `(tenantId, userId)` ownership. Cross-user sharing,
reassignment, admin inspection, and team ACLs require a separate same-tenant
policy plane and are not silently added to the kernel.

## What blocks what

```text
RC7 compatibility ──> kernel release hardening ──> dsh-multi-tenant 0.1 prerelease

DSH principal-scope seam ──> production dsh-multi-tenant-web ──> Web E2E / Web release

search / MCP / durable providers / auth provider / audit / UI
        └──────────── independent, demand-gated follow-ups ────────────┘
```

The roadmap is intentionally short. A new item belongs here only when it blocks
an owned release guarantee; ecosystem work lives on the ecosystem track, and
unsupported concerns remain explicit boundaries.