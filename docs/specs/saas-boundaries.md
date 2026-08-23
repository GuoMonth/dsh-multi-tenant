[简体中文](./saas-boundaries.zh-CN.md) | English

# Spec — SaaS Framework Boundary Planes

> Status: v0.3 live architecture contract after the M1–M3 Core Vertical Slice.

MR-A proved that a SaaS product cannot be modeled as one flat list of interchangeable Providers. Different concerns enter the Runtime at different semantic boundaries and must remain separate so each layer can evolve without pulling unrelated lifecycle or protocol behavior into the Core.

## North-star path

```text
Product / Transport
      ↓ authenticated by product-owned mechanism
Trusted Subject
      ↓ resolve trusted runtime identity
Product Ingress Boundary
      ↓
TenantPrincipal
      ↓
canonical Tenant / Principal
      ↓
Typed Runtime Capabilities
      ↓
Principal-owned one-shot Operation
      ↓ immutable capability snapshot
Agent Integration
      ↓ DSH-native Agent setup / plugin composition
DeepSeek Harness
```

These are **planes**, not package names.

## 1. Product Ingress Boundary

Authentication happens before the Multi-Tenant Runtime trusts identity.

Examples of product-owned mechanisms include JWT, cookies, OAuth/OIDC, SAML, service credentials, queue metadata or a trusted internal caller. The Framework Core does not parse or validate those protocols.

Its semantic boundary begins after authentication has already established a trusted subject:

```text
trusted external subject
        ↓
identity resolution
        ↓
TenantPrincipal { tenantId, userId }
```

The result selects the canonical Tenant/Principal topology. It is not a long-lived Runtime capability and should not be forced into a Principal Provider slot merely because authentication is a SaaS concern.

## 2. Typed Runtime Capability Ownership

Capabilities that live inside Runtime topology use `CapabilityToken<T, Scope>`.

A token binds three facts that must not drift independently:

```text
stable key
+ semantic value type
+ lifecycle/authority scope
```

The token is only a typed semantic identity over Cordis services. Cordis remains the service resolver and lifecycle substrate; this project does not own a second registry or DI container.

Scopes remain:

```text
deployment -> tenant -> principal -> operation
```

A declared scope is authority, not metadata. Tenant/Principal/Operation providers must materially own their capability inside that Cordis scope. Ambient externally mounted capabilities are deployment-only.

## 3. Composition locality

A full `CompositionPlan` has a global fingerprint for exact whole-definition comparison and diagnostics, but canonical Runtime nodes use **scope-local dependency-closure fingerprints**.

Conceptually:

```text
Operation change
  └─ changes Operation slice
     └─ does not invalidate unrelated Principal/Tenant slices

Principal change
  └─ changes Principal slice
     └─ does not invalidate unrelated Tenant slice

Tenant provider dependency changes
  └─ changes Tenant slice because it participates in Tenant creation semantics
```

A scope fingerprint contains providers owned at that scope plus the selected ancestor providers they actually depend on. Unrelated descendants are excluded.

This preserves both properties:

- true canonical creation drift still fails explicitly;
- unrelated lower-level evolution does not force false parent Runtime conflicts.

## 4. One-shot Operation Boundary

Cordis plugin injection is reactive. A user-visible action is not.

A Principal-owned Operation therefore:

1. creates an ephemeral Cordis owner Fiber;
2. materializes Operation-local capability providers;
3. captures required typed capabilities exactly once;
4. executes semantic work once;
5. tears down deterministically.

The immutable snapshot prevents dependency reactivity from becoming transaction re-entry.

## 5. Agent Integration Boundary

Runtime capabilities are not automatically Agent capabilities.

The Operation owns the trusted runtime view. DSH owns Agent/Preset/plugin composition. Their explicit seam is Agent integration:

```text
Operation snapshot
      ↓
Agent integration recipe
      ↓
ownerCtx.agents.create / resume
      ↓
DSH Agent setup(agentCtx)
      ↓
DSH-native tools / prompts / listeners / plugins
```

Do not copy Cordis private isolation state into `Agent.ctx`. Do not invent a parallel Agent tenant registry.

An integration may consume multiple Runtime capabilities and translate them into one DSH-native composition. Therefore integrations such as MCP should not be prematurely modeled as a single flat Runtime Provider slot.

## MCP implication for the next stage

At the current pinned DSH baseline, `@deepseek-ai/dsh-mcp-client` is a Cordis plugin that bridges MCP **Tools** into native `ctx.tools`. Resources and Prompts are not yet bridged by the Harness.

The next stage should therefore test MCP as an **Agent integration reference path**:

```text
Tenant MCP configuration
        +
Principal credentials
        +
Operation snapshot
        ↓
DSH Agent setup
        ↓
@deepseek-ai/dsh-mcp-client
        ↓
native DSH tools
```

Do not create a second MCP protocol stack or compatibility bridge for Resources/Prompts merely to fill an abstract slot.

## 6. Strong deployment isolation remains separate

Cordis Context is a trusted same-process composition and lifecycle boundary. It does not isolate filesystem, process memory, shell, network, environment variables or malicious plugins.

Strong isolation remains a deployment concern such as process/container/Pod boundaries.

## Consequences for future work

The next product/capability MR should be shaped by this topology rather than by the old assumption that Auth, Credentials and MCP are peers:

- **Identity** proves Product Ingress -> `TenantPrincipal`;
- **Credentials** proves a real Principal-owned typed Runtime capability;
- **MCP** proves Agent Integration using Tenant config + Principal credentials + Operation context and native DSH seams.

These may eventually justify separate packages, but package boundaries remain an output of demonstrated APIs/lifecycles, not an input to architecture design.
