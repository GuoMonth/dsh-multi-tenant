[简体中文](./ROADMAP.zh-CN.md) | English

# Roadmap — v0.2 Runtime Contract → v0.3 SaaS Framework

Status: ✅ done · 🚧 current · 🤝 ecosystem/upstream · 🧭 next · ⛔ boundary.

## Version-line policy

### v0.1 — frozen security kernel

Published v0.1 tags are frozen. They define:

- minimal authenticated `TenantPrincipal`;
- immutable session ownership;
- fail-closed authorization;
- replaceable `TenantSessionStore` contract.

No product expansion belongs on v0.1.

### v0.2 — Multi-Tenant Runtime Contract

Goal: make DSH safe to consume as a multi-tenant runtime primitive before any SaaS product composition is built on top.

Current candidate: **`0.2.0-rc.2`**.

The runtime is one canonical ownership tree:

```text
Root -> Tenant -> Principal -> DSH Agent
```

The arrow to Agent is an ownership/composition boundary, not direct service-graph inheritance. DSH Agent/Preset scope remains a separate plane.

### v0.3 — SaaS Framework

v0.3 begins only after the v0.2 Runtime Contract is closed. It will compose Auth, transport binding, Agent integration, provider defaults, MCP SaaS integration, credentials, audit/usage and an opinionated distribution from replaceable Plugin Family components.

## Architecture contract

| Plane | Owner | Purpose |
| --- | --- | --- |
| Persistent authorization | `ctx.multiTenant` + `TenantSessionStore` | Durable session ownership invariant; fail closed. |
| Tenant capability graph | Cordis Context isolation | Tenant-local provider instances and lifecycle. |
| Principal capability graph | Cordis Context isolation | User-local credentials/policy/provider instances. |
| Agent/Preset registration graph | DSH `@deepseek-ai/dsh-scope` | Agent-local tools/prompts/listeners and model-facing visibility. |
| Strong isolation | process/container/K8S | Filesystem, shell, network, memory and hostile-code boundary. |

No second tenant DI container is allowed. Cordis Context owns capability resolution.

## ✅ R0 — v0.1 kernel retained

The security kernel remains deployment-global inside v0.2 and cannot be isolated out of Tenant/Principal graphs.

## ✅ R1 — `0.2.0-rc.1`: architecture proof

rc.1 established:

- real Tenant / Principal Cordis contexts;
- explicit service isolation;
- v0.1 kernel retained as defense in depth;
- DSH Agent/Preset scope kept separate;
- two-tenant isolation tests;
- real Cordis Loader composition;
- packed external-consumer smoke.

rc.1 answered: **can this architecture work?**

## 🚧 R2 — `0.2.0-rc.2`: runtime contract convergence

rc.2 answers: **is the runtime structure stable enough for a SaaS Framework to depend on?**

### P0-A — canonical publication

- Tenant/Principal creation is async and transactional;
- reserve key → unpublished subtree → setup → optional sync commit → publish;
- `get()` never exposes preparing nodes;
- concurrent `ensure()` single-flights;
- failed setup rolls back completely;
- active definition drift fails explicitly.

### P0-B — canonical Principal lifecycle

Tenant and Principal use the same structural vocabulary:

```text
identity + kind + ctx + state + ensure/get + dispose
```

Principal registry is nested under Tenant and keyed by `userId`, making mismatched tenant identity structurally unrepresentable.

Tenant teardown owns/drains Principal teardown before its own quiescence.

### P0-C — DSH Agent owner/composition boundary

Prove against the real DSH AgentRegistry path that:

- `principal.ctx.agents.create()` carries the exact Principal Context to the factory as `ownerCtx`;
- Tenant/Principal identity and capability resolution are correct at that boundary;
- Agent `setup` explicitly composes/project capabilities from the Principal Runtime;
- DSH Agent/Preset scope ancestry remains separate.

Do **not** copy private Cordis isolation maps into Agent.ctx to fake inheritance.

### P0-D — executable Tenant-Safe Provider Contract

Ship `assertRuntimeCapabilityProviderContract()` and require providers to prove:

- same-name A/B isolation;
- root/parent non-leakage;
- descendant inheritance where appropriate;
- sibling non-interference;
- disposal isolation;
- clean recreation;
- setup-time lifecycle ownership.

This contract is the foundation of the future Plugin Family.

## 🧭 R2.5 — v0.2 final hardening

After the four P0s are green, v0.2 should receive only closure work, not new product features:

- teardown/concurrency adversarial tests;
- stress-ish create/dispose/recreate leak checks;
- refresh the complete DSH dependency closure to a modern pinned release in an isolated change;
- document/provider-inventory known DSH global-state gaps;
- no new Auth/Web/Billing/MCP product implementation.

## v0.2 exit criteria

Enter v0.3 when all are true:

1. Tenant/Principal publication is atomic and rollback-covered.
2. Tenant/Principal lifecycle semantics are canonical and unambiguous.
3. Principal → DSH Agent owner/composition seam is executable and pinned by CI.
4. Tenant-Safe Provider Contract is executable for third-party providers.
5. teardown/concurrency tests are green on Node 22 + 24.
6. packed external consumer and real Loader composition are green.
7. one modern DSH baseline passes all compatibility probes.
8. adding Auth/Transport/MCP/Agent SaaS packages no longer requires changing the runtime data model.

At that point: **freeze v0.2 Runtime Contract and move immediately to v0.3.**

## 🧭 v0.3 — SaaS Framework / Plugin Family

Target shape:

```text
                    dsh-saas
            opinionated SaaS distribution
                       │
      ┌────────────────┼────────────────┐
      │                │                │
    Auth           Credentials         MCP
      │                │                │
 Transport           Audit/Usage     Storage/Policy
      └────────────────┼────────────────┘
                       │
              dsh-multi-tenant
           Runtime Contract + Kernel
```

The distribution provides the out-of-box product experience; the Plugin Family provides replaceability and composition.

Expected v0.3 concerns:

- authenticated HTTP/WebSocket → Tenant/Principal binding;
- Agent creation orchestration from Principal Runtime;
- Auth/Credential/MCP provider slots and reference implementations;
- default production composition;
- health/diagnostics/config validation;
- provider compatibility matrix;
- audit/usage foundations;
- optional deployment profiles including shared-runtime and strong tenant-Pod isolation.

## ⛔ Explicit boundaries

Cordis Context is not a hostile-code sandbox. It does not isolate process globals, filesystem/shell, network, environment variables, or a plugin deliberately escaping to `ctx.root`.

Strong tenant isolation remains a process/container/Pod concern. Product-specific billing, organization UI and IAM implementations belong to v0.3 Plugin Family/distribution layers, not the v0.2 runtime core.
