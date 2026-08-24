[English](./saas-boundaries.md) | 简体中文

# Spec —— SaaS Framework Boundary Planes

> 状态：当前 `0.3` live contract。

一个 SaaS Agent product 不是一张扁平 Provider 列表。不同 concern 穿过不同 semantic boundary。

## Product Path

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

这些是 semantic plane，不是 package name。

## 1. Product Ingress Boundary

Authentication 属于产品。Cookie / JWT / OAuth / OIDC / SAML / service credential 与 transport-specific verification 都在 Core 信任 subject 之前完成。

Framework 只拥有：

```text
trusted subject
  -> semantic identity resolver
  -> validated TenantPrincipal
  -> bound canonical Principal
```

`createProductIngress()` 不解析 vendor token，也不建立第二套 auth system。

## 2. RuntimeComposition Boundary

`CompositionPlan` 是 normalized executable intent；`RuntimeComposition` 是它 materialized 后的 product-facing binding。

一个 active root 不能静默组合不同 whole Plan。同 Plan join，不同 whole-plan identity conflict。这里是 whole-plan attestation，与 canonical scope identity 是不同概念。

## 3. Typed Runtime Capability Ownership

Runtime capability 使用 `CapabilityToken<T, Scope>` 和真实 Cordis lifecycle scope：

```text
deployment -> tenant -> principal -> operation
```

`principalCredentials` 是 Principal-owned；`tenantMcpConfig` 是 Tenant-owned。Cordis 继续承担 resolver / lifecycle substrate。

## 4. Composition Locality

```text
whole Plan fingerprint        product Runtime attestation
scopeFingerprints.tenant      Tenant creation dependency closure
scopeFingerprints.principal   Principal creation dependency closure
scopeFingerprints.operation   Operation provider dependency closure
```

无关 descendant evolution 不应该制造 false parent drift；真实 ancestor dependency change 必须改变对应 identity。

## 5. One-shot Operation Boundary

一次 user-visible action 拥有一个短生命周期 Principal Operation：materialize Operation provider、required typed capability 只 capture 一次、semantic work 只 execute 一次、最后 teardown。

Bound API 不接受另一张 Plan，也会拒绝 Plan 未声明的 capability。

## 6. Agent Integration Boundary

Runtime state 只有通过显式 integration 才变成 Agent state：

```text
Tenant MCP config + Principal credentials
  -> Operation snapshot / authorization
  -> Principal Context
  -> DSH Agent setup
  -> 官方 MCP client
  -> native Agent-scoped Tools
```

Live Agent 是 Principal-owned，因此 create/resume Operation 结束后仍可存活，同时会被 Principal teardown 回收。

MCP 使用官方 DSH Tools bridge。本项目不造平行 MCP stack；pinned Harness 没有稳定 native consumer seam 时，也不虚构 Resources / Prompts 支持。

## Strong Deployment Isolation

以上 boundary 都假设 trusted same-process composition。Filesystem / process / shell / network / malicious-plugin isolation 属于 deployment / container / Pod / sidecar / remote architecture。
