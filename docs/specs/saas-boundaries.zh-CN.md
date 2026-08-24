[English](./saas-boundaries.md) | 简体中文

# Spec —— SaaS Framework Boundary Planes

> Status：M4 之后的 v0.3 live contract。

一个 SaaS product 不是“一张扁平 Provider 列表”。不同 concern 穿过的是不同 semantic boundary。

## North-star Path

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

这些是 plane，不是 package name。

## 1. Product Ingress Boundary

Authentication 属于产品。Cookie / JWT / OAuth / OIDC / SAML / service credential 与 transport verification 都在 Core 信任 subject 之前完成。

Framework 只拥有：

```text
trusted subject
  -> semantic identity resolver
  -> validated TenantPrincipal
  -> bound canonical Principal
```

`createProductIngress()` 已经实现这个 boundary。它不解析 vendor token，也不建立第二套 auth system。

## 2. RuntimeComposition Boundary

`CompositionPlan` 是 normalized executable intent；`RuntimeComposition` 是它 materialized 后的 product-facing binding。

一个 active root 不能静默把不同 whole Plan 的部分拼起来。同 Plan join，不同 whole-plan identity conflict。这是 **whole-plan attestation**，不是 canonical scope identity。

## 3. Typed Runtime Capability Ownership

Runtime capability 使用 `CapabilityToken<T, Scope>` 与真实 Cordis lifecycle scope：

```text
deployment -> tenant -> principal -> operation
```

Credentials 现在是第一个具体 product-facing example：`principalCredentials` 真正 Principal-owned，而不是只贴一个 `principal` metadata。

Cordis 继续承担 resolver / lifecycle substrate。

## 4. Composition locality

Canonical node identity 继续 scope-local：

```text
whole Plan fingerprint        product Runtime attestation
scopeFingerprints.tenant      Tenant creation dependency closure
scopeFingerprints.principal   Principal creation dependency closure
scopeFingerprints.operation   Operation provider dependency closure
```

Operation-only change 不制造 false Tenant / Principal drift；真实 ancestor dependency change 必须改变对应 identity。

Locality 与 strict whole-plan `RuntimeComposition` binding 并不冲突，因为二者回答不同问题。

## 5. One-shot Operation Boundary

一次 user-visible action 拥有一个 Principal child Operation：materialize Operation provider、required typed capability 只 capture 一次、execute 一次、最后 teardown。

Bound API 不接受另一张 Plan，也不让 caller 覆盖任意 Operation setup recipe；请求 Plan 未声明的 capability 会直接失败。

## 6. Agent Integration Boundary

Runtime state 不会自动泄漏成 Agent state：

```text
Operation snapshot
  -> Agent integration recipe
  -> DSH ownerCtx create/resume
  -> Agent setup
  -> native DSH tools/plugins
```

MCP 属于下一步 reference path，因为一条 integration 会同时消费 Tenant MCP config + Principal Credentials + Operation state，再转换成 DSH-native setup。

## M5 含义

下一目标使用官方 `@deepseek-ai/dsh-mcp-client` 的 Tool path。不造平行 MCP protocol stack；pinned Harness 没有稳定 native consumer seam 时，不为 Resources / Prompts 写 compatibility layer。

## Strong Deployment Isolation

以上 boundary 都假设 trusted same-process composition。Filesystem / process / shell / network / malicious-plugin isolation 属于 deployment / container / Pod architecture。
