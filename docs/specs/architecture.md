[简体中文](./architecture.zh-CN.md) | English

# Architecture — trusted ingress, typed runtime, one-shot operation, native Agent integration

This document is the current architecture authority for `dsh-multi-tenant` v0.3.

The design goal is not to spread tenant checks, provider registries or protocol adapters across APIs. It is to give each concern one explicit structural owner so product features grow from the topology instead of accumulating middleware patches.

## 1. End-to-end topology

```text
Product / Transport
      ↓ product-owned authentication
Trusted Subject
      ↓ identity resolution
Product Ingress Boundary
      ↓
TenantPrincipal
      ↓
Deployment / Root
  ├─ TenantSessionStore               durable ownership seam
  ├─ MultiTenantService               fail-closed authorization kernel
  └─ TenantRuntimeService
       └─ Tenant                      canonical capability node
            └─ Principal             canonical capability node
                 └─ Operation        ephemeral one-shot work
                      ↓ typed immutable capability snapshot
                 Agent Integration
                      ↓ DSH-native setup/plugins
                 DeepSeek Harness
```

The topology intentionally separates four questions:

1. **Who is trusted to enter the Runtime?** — Product Ingress.
2. **Who owns long-lived capability state?** — Deployment/Tenant/Principal Runtime scopes.
3. **Who owns one user-visible execution?** — Principal Operation.
4. **How does trusted Runtime state become Agent behavior?** — explicit DSH-native Agent Integration.

These are semantic planes, not package names.

## 2. Product Ingress happens before Runtime capability ownership

The Framework Core does not parse JWT, cookies, OAuth/OIDC, SAML or vendor authentication protocols.

A product authenticates the request/caller first, then passes a trusted subject through an identity-resolution boundary:

```text
trusted product subject
        ↓
identity resolver
        ↓
TenantPrincipal { tenantId, userId }
```

That identity selects the canonical Tenant/Principal topology.

Authentication is therefore not modeled as a long-lived Principal capability merely because it is a SaaS concern. Product Ingress and Runtime capability ownership are different boundaries.

## 3. Canonical Runtime tree

Tenant and Principal are live runtime nodes, not request DTOs.

```ts
interface RuntimeScope<K, I> {
  readonly kind: K
  readonly identity: Readonly<I>
  readonly ctx: Context
  readonly state: 'active' | 'disposing' | 'disposed'
  dispose(): Promise<void>
}

interface RuntimeScopeRegistry<Key, Scope, Definition> {
  get(key: Key): Scope | undefined
  ensure(key: Key, definition?: Definition): Promise<Scope>
}
```

Principal is structurally nested under Tenant. A Principal registry accepts only `userId`; `tenantId` comes from its parent. Cross-Tenant Principal binding is not a normal representable creation path.

Principal additionally owns ephemeral Operations:

```ts
interface PrincipalRuntimeScope extends RuntimeScope<'principal', TenantPrincipal> {
  readonly operations: PrincipalOperationRegistry
}
```

## 4. Canonical creation is transactional

Tenant/Principal setup is unpublished until complete:

```text
ABSENT
  ↓ reserve identity
PREPARING                    not visible through get()
  ↓ create isolated Cordis subtree
  ↓ await setup(signal)
  ↓ optional synchronous commit()
ACTIVE / published
```

Failure or cancellation disposes the unpublished subtree and returns to ABSENT.

Concurrent `ensure()` calls for one canonical identity single-flight into one creation transaction. Parent teardown closes admission, cancels preparing children, drains published children, then disposes the owner Fiber.

## 5. CapabilityToken binds semantic identity

Runtime capability identity is represented by:

```ts
CapabilityToken<T, Scope>
```

which binds:

```text
stable Cordis service key
+ TypeScript value type
+ lifecycle / authority scope
```

Example:

```ts
const credentials = defineCapability<Credentials, 'principal'>(
  'credentials',
  'principal',
)
```

A token does **not** create a new service registry. `provideCapability()` / `getCapability()` are thin typed facades over Cordis `ctx.provide()` / `ctx.get()`.

Cordis remains the only service-resolution and lifecycle substrate.

## 6. Scope is authority, not metadata

The Runtime recognizes:

```text
deployment -> tenant -> principal -> operation
```

A capability token owns one of these semantic scopes.

- deployment — process/application-wide;
- tenant — owned by one canonical Tenant;
- principal — owned by one canonical Principal;
- operation — owned by one ephemeral Operation.

An ambient externally mounted capability may be deployment-scoped. Tenant/Principal/Operation providers must materially create their capability inside the corresponding isolated Cordis scope.

This prevents fake declarations such as “Principal credentials” that actually inherit one root-global secret service.

## 7. SaaSDefinition compiles into immutable CompositionPlan

Mutable product/distribution intent is not Runtime truth:

```text
SaaSDefinition
      ↓ compile / validate
CompositionPlan
      ↓ materialize
Cordis-backed Runtime scopes
```

The compiler owns:

- typed capability declarations;
- provider selection;
- dependency graph validation;
- dependency visibility;
- cycle detection;
- deterministic bootstrap order;
- whole-plan and scope-local structural identity.

Runtime execution never repeatedly reinterprets the raw Definition.

## 8. Composition identity is local

The Plan contains two kinds of identity:

```text
plan.fingerprint
    exact whole-plan structural identity

plan.scopeFingerprints[scope]
    providers owned by that scope
    + selected ancestor providers in their dependency closure
```

Canonical Tenant and Principal definitions use their **scope-local dependency-closure fingerprint**.

Consequences:

```text
Operation-only provider change
  -> changes whole Plan + Operation slice
  -> does not invalidate unrelated Principal/Tenant

Principal-only provider change
  -> changes Principal slice
  -> does not invalidate unrelated Tenant

Ancestor provider used by Tenant changes
  -> changes Tenant slice
  -> explicit RuntimeDefinitionConflictError for an active incompatible Tenant
```

This is not hot reconfiguration. v0.3 does not mutate an active canonical creation recipe in place; recreate the affected scope when its local creation identity changes.

## 9. Operation is one-shot semantic work

Cordis `ctx.inject()` is dependency-reactive. It may unload and rerun its callback after provider loss/recovery. That is correct for long-lived plugins and wrong as the definition of one user transaction.

A Principal Operation therefore has its own non-reactive lifecycle:

```text
Principal
  └─ Operation owner Fiber
       ↓ materialize Operation-local providers
       ↓ capture required CapabilityToken values exactly once
       ↓ immutable snapshot
       ↓ execute semantic work exactly once
       ↓ deterministic teardown
```

Typical API:

```ts
const operation = principal.operations.start({
  ...operationDefinitionFromPlan(plan),
  requires: [agents, credentials],
  async execute({ capabilities, signal }) {
    const dshAgents = capabilities.require(agents)
    const credential = capabilities.require(credentials)
    // semantic work executes once
  },
})
```

Provider churn after capture may make a real provider unusable, but it never re-enters `execute()`.

Principal disposal closes Operation admission and drains active/preparing Operations before Principal teardown finishes.

## 10. Agent Integration is a separate boundary

Runtime capability ownership is not DSH Agent/Preset registration.

The explicit seam is:

```text
Operation snapshot
      ↓
Agent Integration
      ↓
ownerCtx.agents.create / resume
      ↓
DSH Agent setup(agentCtx)
      ↓
native DSH tools / prompts / listeners / plugins
```

The Runtime layer does not:

- copy Cordis private isolation maps into `Agent.ctx`;
- make Tenant a second parent in DSH Agent/Preset ancestry;
- invent an Agent-specific tenant service registry;
- replace DSH plugin loading with a local wrapper protocol.

The real DSH AgentRegistry is executable evidence that create/resume receives the caller-bound Operation/Principal `ownerCtx`.

## 11. MCP is currently an Agent Integration reference path

At the pinned DSH baseline, `@deepseek-ai/dsh-mcp-client` is a native Cordis plugin that bridges MCP **Tools** to `ctx.tools`.

Therefore the next real MCP proof should look like:

```text
Tenant MCP configuration
        +
Principal credentials
        +
Operation snapshot
        ↓
Agent Integration
        ↓
DSH Agent setup
        ↓
@deepseek-ai/dsh-mcp-client
        ↓
native DSH Tools
```

MCP is not prematurely defined as one flat Runtime Provider slot because the integration consumes multiple Runtime capabilities and materializes DSH-native Agent behavior.

The pinned Harness does not bridge MCP Resources/Prompts. v0.3 does not build a parallel compatibility protocol merely to simulate unsupported consumers.

## 12. Persistent authorization is independent defense in depth

Runtime identity helpers (`runtimeIdentityOf`, `tenantIdOf`, `principalOf`) expose trusted same-process composition metadata. They are not durable authorization decisions.

Session/durable boundaries continue to use `MultiTenantService` + `TenantSessionStore`:

```text
(tenantId, userId) -> session ownership
```

with claim-once immutable ownership and fail-closed access checks.

## 13. Provider compatibility is executable

A plugin being mountable below a Context does not make it tenant-safe. It can still leak through root state, module globals, process environment or external shared state.

`dsh-multi-tenant/testing` therefore protects Runtime provider invariants such as:

- Tenant A/B isolation;
- Principal sibling isolation;
- ancestor inheritance;
- root/parent non-leakage;
- teardown isolation;
- clean recreation;
- unpublished setup ownership.

Future Product Ingress and Agent Integration contracts require their own executable conformance rather than inheriting “provider-safe” by analogy.

## 14. Package topology follows demonstrated boundaries

Current public topology remains one package:

```text
dsh-multi-tenant
├─ runtime
├─ operation
├─ composition
├─ store
└─ testing
```

No `dsh-saas`, Auth or MCP package is pre-created.

A package is introduced only when implementation proves an independent consumer API, replacement/lifecycle boundary, release cadence or Distribution boundary.

## 15. Strong isolation remains deployment-owned

Cordis Context is a trusted same-process capability/lifecycle structure, not a hostile-code sandbox. It does not isolate process memory, filesystem, shell, network, environment variables or malicious same-process plugins.

Strong isolation belongs to deployment profiles such as process/container/Pod boundaries.

## 16. Compatibility baseline

Current exact DSH baseline and executable evidence policy are defined in [`../reference/compatibility.md`](../reference/compatibility.md). Architecture code must not depend on floating upstream state.
