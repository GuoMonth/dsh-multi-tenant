[简体中文](./saas-boundaries.zh-CN.md) | English

# Spec — SaaS Framework Boundary Planes

> Status: live `0.3` contract.

A SaaS Agent product is not one flat provider list. Different concerns cross different semantic boundaries.

## Product path

```text
Product / Transport authentication
      ↓
Trusted Subject
      ↓
Product Ingress Boundary
      ↓ TenantPrincipal
RuntimeComposition
      ↓
Typed Runtime Capability Ownership
      ↓
Principal-owned one-shot Operation
      ↓
Principal-owned DSH Agent
      ↓
Agent Integration Boundary
      ↓
Native DSH integrations / MCP Tools
```

These are semantic planes, not package names.

## 1. Product Ingress Boundary

Authentication is product-owned. Cookie/JWT/OAuth/OIDC/SAML/service credentials and transport-specific verification happen before Core trusts a subject.

The framework owns only:

```text
trusted subject
  -> semantic identity resolver
  -> validated TenantPrincipal
  -> bound canonical Principal
```

`createProductIngress()` does not parse vendor tokens or create a second auth system.

## 2. RuntimeComposition boundary

A `CompositionPlan` is normalized executable intent; a `RuntimeComposition` is its materialized product-facing binding.

One active root cannot silently combine parts from different whole Plans. Same Plan joins; different whole-plan identity conflicts. This is whole-plan attestation, distinct from canonical scope identity.

## 3. Typed Runtime Capability Ownership

Runtime capabilities use `CapabilityToken<T, Scope>` with real Cordis lifecycle scopes:

```text
deployment -> tenant -> principal -> operation
```

`principalCredentials` is Principal-owned. `tenantMcpConfig` is Tenant-owned. Cordis remains the resolver/lifecycle substrate.

## 4. Composition locality

```text
whole Plan fingerprint        product Runtime attestation
scopeFingerprints.tenant      Tenant creation dependency closure
scopeFingerprints.principal   Principal creation dependency closure
scopeFingerprints.operation   Operation provider dependency closure
```

Unrelated descendant evolution does not create false parent drift, while a real ancestor dependency change does.

## 5. One-shot Operation boundary

A user-visible action owns one short Principal Operation. It materializes Operation providers, captures required typed capabilities once, executes semantic work once and tears down.

The bound API does not accept another Plan and rejects capabilities that the Plan never declared.

## 6. Agent Integration Boundary

Runtime state becomes Agent state only through explicit integration:

```text
Tenant MCP config + Principal credentials
  -> Operation snapshot / authorization
  -> Principal Context
  -> DSH Agent setup
  -> official MCP client
  -> native Agent-scoped Tools
```

The live Agent is Principal-owned, so it survives the short create/resume Operation and is still drained by Principal teardown.

MCP uses the official DSH Tools bridge. The project does not build a parallel MCP stack, and it does not synthesize Resources/Prompts support while the pinned Harness lacks a stable native consumer seam.

## Strong deployment isolation

All boundaries above assume trusted same-process composition. Filesystem/process/shell/network/malicious-plugin isolation belongs to deployment/container/Pod/sidecar/remote architecture.
