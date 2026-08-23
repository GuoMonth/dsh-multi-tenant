[简体中文](./ROADMAP.zh-CN.md) | English

# Roadmap

The project is moving quickly and does not promise prerelease API compatibility. The governing rule is to optimize the architecture, data model, state transitions and semantic types for the long-term system rather than preserve early shapes.

## Version lines

### v0.1 — frozen security kernel

v0.1 owns the durable authorization invariant:

- minimal `{ tenantId, userId }` principal identity;
- claim-once immutable session ownership;
- fail-closed authorization;
- replaceable `TenantSessionStore` contract.

This layer should remain small and boring.

### v0.2 — Multi-Tenant Runtime Contract

v0.2 makes tenancy a first-class runtime structure rather than repeated `tenantId` plumbing.

This line is complete when the final convergence PR is green and merged. Its contract is:

```text
Deployment / Root
  ├─ shared ownership kernel
  └─ TenantRuntimeService
       └─ Tenant                  canonical capability node
            └─ Principal         canonical capability node
                 └─ derived integration fibers
                      └─ DSH Agent / transport / provider operations
```

#### Canonical runtime structure

- Tenant and Principal share one `ensure/get/state/dispose` vocabulary.
- Principal is structurally nested under Tenant; invalid tenant/principal combinations are not representable.
- Consumer code may join an existing canonical node by identity without knowing its creation recipe.
- Explicit definitions are validated for capability-definition drift.

#### Publication and lifecycle

- creation reserves canonical identity before doing asynchronous work;
- setup runs on an unpublished Cordis subtree;
- optional synchronous `commit()` owns the exact publication boundary;
- concurrent `ensure()` calls single-flight;
- preparing transactions are first-class cancellable lifecycle resources;
- registry shutdown closes admission, cancels unpublished creation, then drains published scopes;
- failed setup rolls back completely;
- Tenant teardown owns Principal teardown.

#### Capability and Agent semantics

- Cordis service isolation owns Tenant/Principal capability authority and provider lifetime;
- DSH `@deepseek-ai/dsh-scope` owns Agent/Preset registration visibility;
- a Principal Context is a capability root, not a dependency-injection bypass;
- operations derive an integration fiber and explicitly inject the services they need;
- Agent creation uses the real DSH caller-bound `ownerCtx` seam rather than copying private Context state.

#### Provider ecosystem contract

`dsh-multi-tenant/testing` provides an executable Runtime Capability Provider Contract covering A/B isolation, leakage, inheritance, siblings, teardown, recreation and unpublished setup.

#### DSH baseline and evidence

Current explicit baseline:

- DSH version: `0.1.1-rc.2`
- release commit: `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

The baseline is manually advanced. Blocking CI never follows floating upstream state.

CI proves both:

1. exact upstream source identity by checking out the pinned release commit;
2. exact published runtime behavior through session genesis, admission/publication and Agent owner/composition probes.

#### Release model

The project currently keeps release mechanics deliberately simple:

- package version lives in `packages/multi-tenant/package.json`;
- manual GitHub release workflow derives that version automatically;
- npm publishes to `latest` only;
- registry smoke verifies that `latest` resolves to the just-published version;
- prerelease/stable meaning belongs to the SemVer version itself, not a second npm channel.

## v0.3 — SaaS Framework

After v0.2 freezes, the main line becomes the SaaS Framework.

The target is **an opinionated, out-of-the-box SaaS product experience built from a replaceable Plugin Family**, not a monolithic super-plugin.

Conceptually:

```text
                         dsh-saas
                 SaaS Distribution / Framework
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
      Auth              Credentials            MCP
        │                   │                   │
    Transport              Audit              Usage
        │                   │                   │
        └──────────── Provider Contracts ───────┘
                            │
                   dsh-multi-tenant
                 Runtime Contract + Kernel
```

### v0.3 priorities

1. **SaaS composition model** — define provider slots and a typed configuration/composition graph.
2. **Authenticated transport binding** — authenticate at wire boundaries, resolve canonical Tenant/Principal runtime, then run work from a derived integration fiber.
3. **Agent orchestration** — create/resume/drive DSH Agents through the Principal-owned integration boundary while preserving DSH Agent/Preset scope semantics.
4. **Reference provider family** — Auth, credential/token storage, MCP tenancy, durable stores, audit/usage where justified.
5. **Distribution defaults** — one recommended composition that works out of the box while allowing every provider slot to be replaced.
6. **Diagnostics and compatibility** — startup validation, health, provider conformance, migrations and a clear compatibility matrix.

Strong isolation remains a deployment profile, not a Context promise. A future K8S profile may map one Tenant to one Pod while preserving the same higher-level SaaS contracts.

## Engineering rules

- design globally before editing locally;
- prefer structures that make invalid states unrepresentable;
- model lifecycle/state transitions explicitly;
- use TypeScript strong types and generics to carry semantics;
- keep one source of truth for identities such as package version and DSH baseline;
- do not preserve prerelease compatibility when it degrades the long-term model;
- use Cordis/DSH native abstractions rather than parallel registries or local forks;
- where this repository controls the boundary, enforce it; where the ecosystem owns it, standardize it; where neither applies, document the boundary.

## Explicit security boundary

Cordis Context is a trusted same-process composition/lifecycle boundary, not a hostile-code sandbox. It does not isolate process memory, filesystem, shell, network, environment variables or malicious plugins. Strong isolation belongs to process/container/Pod boundaries.
