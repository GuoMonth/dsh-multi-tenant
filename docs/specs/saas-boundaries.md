[简体中文](./saas-boundaries.zh-CN.md) | English

# Spec — SaaS Framework Boundary Planes

> Status: live v0.3 contract after M4.

A SaaS product is not one flat provider list. Different concerns cross different semantic boundaries.

## North-star path

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
Agent Integration Boundary
      ↓
DeepSeek Harness
```

These are planes, not package names.

## 1. Product Ingress Boundary

Authentication is product-owned. Cookie/JWT/OAuth/OIDC/SAML/service credentials and transport-specific verification all happen before Core trusts a subject.

The framework owns only:

```text
trusted subject
  -> semantic identity resolver
  -> validated TenantPrincipal
  -> bound canonical Principal
```

`createProductIngress()` now implements this boundary. It does not parse vendor tokens or create a second auth system.

## 2. RuntimeComposition boundary

A `CompositionPlan` is normalized executable intent; a `RuntimeComposition` is its materialized product-facing binding.

One active root cannot silently combine parts from different whole Plans. Same Plan joins; different whole-plan identity conflicts. This is **whole-plan attestation**, not canonical scope identity.

## 3. Typed Runtime Capability Ownership

Runtime capabilities use `CapabilityToken<T, Scope>` and real Cordis lifecycle scopes:

```text
deployment -> tenant -> principal -> operation
```

Credentials are now the first concrete product-facing example: `principalCredentials` is truly Principal-owned rather than merely labeled `principal`.

Cordis remains the resolver and lifecycle substrate.

## 4. Composition locality

Canonical node identity remains scope-local:

```text
whole Plan fingerprint        product Runtime attestation
scopeFingerprints.tenant      Tenant creation dependency closure
scopeFingerprints.principal   Principal creation dependency closure
scopeFingerprints.operation   Operation provider dependency closure
```

An Operation-only change does not create false Tenant/Principal drift. A real ancestor dependency change does.

This locality can coexist with strict whole-plan `RuntimeComposition` binding because the two identities answer different questions.

## 5. One-shot Operation boundary

A user-visible action owns one Principal child Operation. It materializes Operation providers, captures required typed capabilities exactly once, executes exactly once and tears down.

The bound API does not accept another Plan or arbitrary Operation setup recipe. It also rejects a requested capability that the Plan never declared.

## 6. Agent Integration Boundary

Runtime state does not automatically leak into Agent state.

```text
Operation snapshot
  -> Agent integration recipe
  -> DSH ownerCtx create/resume
  -> Agent setup
  -> native DSH tools/plugins
```

MCP belongs here as the next reference path because one integration consumes multiple Runtime capabilities (for example Tenant MCP config + Principal Credentials + Operation state) and translates them into DSH-native setup.

## M5 implication

The next target is the official `@deepseek-ai/dsh-mcp-client` Tool path. Do not build a parallel MCP protocol stack. Do not implement Resources/Prompts compatibility merely to fill an abstraction slot while the pinned Harness lacks a stable native consumer seam.

## Strong deployment isolation

All boundaries above assume trusted same-process composition. Filesystem/process/shell/network/malicious-plugin isolation belongs to deployment/container/Pod architecture.
