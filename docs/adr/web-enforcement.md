[简体中文](./web-enforcement.zh-CN.md) | English

# ADR — DSH Web Multi-Tenant Enforcement (release-converged)

> Status: **proposed**. Converges the session-genesis, admission-composition,
> real-`ApiProxy`, and RC7 transport evidence. This ADR now follows the project
> boundary rule: owned enforcement is implemented here; missing DSH transport
> scope is an ecosystem seam, not a reason to fork the carrier.

## Context

The core (`dsh-multi-tenant`) owns session ownership and fail-closed
authorization. The Web question is narrower: what is the smallest DSH seam
needed to carry an authenticated request/connection identity into that owned
enforcement without shared ambient state?

## Converged findings

| Concern | Status |
| --- | --- |
| **H1 — session genesis** | **Resolved.** Agent `setup` is the before-visibility async admission point; no kernel change is required. |
| **Admission composability** | **Runtime-proven on RC6; RC7 refresh is release compatibility work.** A decorator joins `ctx.agents.create/resume` and runs admission before `sessions.enter`. |
| **Unary enforcement** | **Implemented as the real shape.** `bindTenant` wraps the real `ApiProxy`; every `RpcMethodMap` member is exhaustively classified and the policy fails closed. |
| **H3 — request/connection principal scope** | **RC7 ecosystem gap.** Public `ConnectionRpcHandler` receives only decoded `(endpoint, payload, signal)`, while the DSH Web carrier owns the real HTTP/WS boundary and documents that it has no authentication layer. |
| **Streams / respond** | **Deferred behind H3.** They remain denied in the spike. Implement them only when a real principal-scoped transport path exists. |
| **Ghost ownership** | **v0 security-safe tombstone.** Session ids must not be reused; cleanup semantics are independent later work. |

## H3 under RC7 — ecosystem deliverable

The facade needs a `TenantPrincipal`, but RC7's public Connection RPC seam no
longer has the transport request when the decoded handler runs. The real HTTP
request / WS upgrade is held inside the DSH Web carrier, and the shipped carrier
explicitly describes its host fence as reachability policy rather than
authentication.

That evidence is sufficient to classify H3 as **ecosystem-owned**. The project
should not build and maintain a production replacement for DSH's Web transport
just to make the local checklist complete.

The deliverable is a **minimal tenant-agnostic upstream seam** that lets a
consumer derive or install request/connection-scoped API/security context from
the actual HTTP request / WS upgrade. The proposal should preserve DSH's carrier
ownership and be useful beyond this plugin.

A small local probe may still be used to sharpen an API proposal, but a full
HTTP/WS transport clone is no longer a prerequisite for the kernel release or
for filing the upstream proposal.

## v0 Web spike security policy

`RpcMethodMap` coverage is exhaustive, but exhaustive coverage does not make
host-global capabilities tenant-safe. Until real resource semantics and H3
exist, the spike stays fail-closed:

- session-keyed point operations → **GUARD**;
- `session.list` → **FILTER** only while post-filtering preserves semantics;
- `session.create` → **ADMIT**, denied until principal-scoped admission can be
  installed before publication;
- `session.search` → **DENY** for now; tenant-scoped ranking/visibility belongs
  to a later search contract;
- deployment/host management (`settings.*`, `credentials.*`, host/workspace,
  preset authoring, host-scoped LLM configuration/discovery) → **DENY**;
- explicitly tenant-neutral read-only discovery may be **ALLOW**.
- streams, `respond`, and downloads stay **DENY** until their supported security
  semantics are implemented.

## Explicitly not required

Current evidence does **not** require:

- a kernel change;
- a global setup-contribution registry;
- a permanent fork or reimplementation of DSH Web transport;
- JWT/OIDC/API-key logic inside the kernel;
- making host-global DSH resources tenant-owned as part of v0.1.

`respond` may require correlation state once a principal-scoped connection path
exists. That is an enforcement detail to prove then, not a reason to expand the
upstream proposal preemptively.

## Next

1. **Release track:** refresh the affected admission/ApiProxy evidence on RC7;
   this is enough for the kernel compatibility baseline.
2. **Ecosystem track:** file the small request/connection-scope upstream
   proposal, with concurrency and HTTP/WS lifetime conformance expectations.
3. **After an adequate seam exists:** turn `dsh-multi-tenant-web` into a
   production plugin and prove mux/host/respond plus unary/admission in a
   two-tenant E2E suite.

Production Web enforcement no longer blocks the first `dsh-multi-tenant`
kernel prerelease.