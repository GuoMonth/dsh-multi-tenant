[简体中文](./ROADMAP.zh-CN.md) | English

# Roadmap — kernel released, converge toward stable 0.1

Statuses: ✅ done · 🚧 release candidate · 🤝 ecosystem · 🧭 later / demand-gated · ⛔ explicit boundary.

## Current state

`dsh-multi-tenant` now has a real public prerelease line targeting DeepSeek
Harness `0.1.0-rc.7`.

- ✅ `0.1.0-rc.1` published to npm `next` with provenance.
- ✅ Registry external-consumer smoke passed.
- ✅ Matching Git tag / GitHub prerelease created.
- ✅ npm Trusted Publishing is the publication path; the release workflow is now OIDC-only.
- 🚧 `0.1.0-rc.2` is the final planned API-convergence candidate before deciding on `0.1.0` stable.

The release promise remains deliberately narrow: immutable session ownership and
fail-closed authorization on surfaces this repository owns.

## Boundary matrix

| Surface | Classification | Project position |
| --- | --- | --- |
| Tenant/user identity + session ownership + access decisions | **Control → enforce** | Kernel contract; fail closed and test-pin it. |
| `TenantSessionStore` seam + shared contract suite | **Control → enforce** | Kernel-owned seam; in-memory reference only. |
| Agent genesis admission (`setup`) | **Control → enforce** | RC7 runtime proof remains a compatibility gate. |
| Unary `ApiProxy` classification | **Control → enforce** | Exhaustive fail-closed classification in the private Web spike. |
| HTTP/WS request/connection principal scope | **Ecosystem → standardize** | Requires a generic DSH transport seam; do not fork the transport. |
| Production Web streams / `respond` / admission | **After ecosystem seam** | Keep unsupported surfaces denied until principal scope exists. |
| Durable ownership stores | **Later provider** | Add only when real contributor/user demand exists. |
| Auth providers | **Later provider** | Only after a real transport principal scope exists. |
| `session.search` tenant visibility | **Ecosystem / later** | Deny until correct scoped-query semantics exist. |
| MCP tenant context | **Ecosystem / later** | Standardize only when the seam and demand are concrete. |
| Shell/filesystem/process/container/network isolation | **Explicit boundary** | Deployment/runtime responsibility, not this plugin family. |
| Billing/UI/org/user admin/general RBAC | **Explicit boundary** | Not a repository goal. |
| Team sharing/ACL/reassignment | **Explicit v0.1 boundary** | Separate same-tenant policy plane if ever needed. |

## Completed release track

- ✅ **R1 — RC7 compatibility refresh** — DSH target/pins centralized and the affected runtime proofs run on Node 22.19 + Node 24.
- ✅ **R2 — Kernel release hardening** — package metadata, supported guarantees, explicit boundaries, packed external-consumer smoke, and release preflight established.
- ✅ **R3 — First public prerelease** — `dsh-multi-tenant@0.1.0-rc.1` published to npm `next`; provenance, registry smoke, Git tag, and GitHub prerelease all succeeded.

Historical evidence remains in `docs/reference/compatibility.md`; current release mechanics live in `docs/reference/release.md`.

## 🚧 rc.2 — final API subtraction before stable

`0.1.0-rc.2` is intentionally a convergence release, not a feature release:

1. reduce `TenantPrincipal` to `{ tenantId, userId }`;
2. remove the unused role validation/public contract;
3. keep RBAC/policy attributes outside the ownership kernel;
4. publish through npm Trusted Publishing/OIDC only — no bootstrap token fallback;
5. rerun the same release proof and registry consumer smoke.

After rc.2, do **not** create another prerelease merely for roadmap progress.
Without a real bug, upstream compatibility change, or user feedback requiring a
contract change, the next decision is whether the kernel is ready for `0.1.0` stable.

## Ecosystem track — non-blocking for the kernel

### 🤝 E1 — DSH principal-scope seam

Propose the smallest tenant-agnostic request/connection-scoped security-context
seam upstream. It must cover HTTP request scope, WebSocket connection lifetime,
concurrent principals without ambient/global cross-talk, admission before
session publication, and event/response correlation where required.

### 🤝 E2 — Production Web enforcement after E1

Only after DSH exposes an adequate principal-scope seam should
`dsh-multi-tenant-web` become publishable: wire admission/unary/streams/respond
under one principal scope and add minimal two-tenant adversarial E2E.

### 🤝 E3 — Other contracts only on demand

Search visibility, MCP context propagation, and DSH-global resource tenancy are
independent demand-gated contracts, not mandatory milestones.

## Later providers

🧭 Durable store providers (PostgreSQL/Redis/MySQL), a reference auth provider,
or lifecycle/admin cleanup may be added independently when there is real demand.
They do not expand the kernel guarantee.

## Explicit non-goals

⛔ The 0.1 line does not claim strong process/container isolation. A tenant-authorized
Agent still has whatever shell/filesystem/network capabilities its deployment grants.

⛔ The repository does not become a billing system, identity directory, UI product,
or general RBAC framework.

⛔ It does not reimplement DSH Web transport, search, MCP runtime, or host resource
models to make every concern locally solvable.

⛔ v0.1 ownership is immutable `(tenantId, userId)`. Roles and permissions are not
part of `TenantPrincipal`; cross-user sharing and admin policy require a separate
same-tenant policy plane.

The roadmap stays short on purpose: owned guarantees are enforced, ecosystem
dependencies are standardized, and everything else remains an explicit boundary.
