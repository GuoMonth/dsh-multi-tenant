[English](./architecture.md) | 简体中文

# Architecture

> 当前 `dsh-multi-tenant` Runtime / SaaS Core 的 live authority。

## Topology

```text
Product / Transport authentication
        ↓ trusted subject
Product Ingress Boundary
        ↓ TenantPrincipal
RuntimeComposition
        │ exact plan attestation
        ▼
TenantRuntimeService
  └─ canonical Tenant
       └─ canonical Principal
            └─ Principal-owned Operation
                 └─ Agent Integration
                      └─ DeepSeek Harness
```

当前架构刻意拆开五个 plane：

1. **Persistent authorization** —— `TenantSessionStore` + `MultiTenantService` 拥有 immutable Session ownership；
2. **Product Ingress Boundary** —— 把 already trusted subject 映射成 `TenantPrincipal`，不解析 authentication protocol；
3. **Runtime composition** —— `RuntimeComposition` 把一张精确 `CompositionPlan` 绑定成一个 materialized product Runtime；
4. **Runtime capability / Operation** —— Cordis Context / Fiber 拥有 Deployment / Tenant / Principal / Operation capability 与生命周期；
5. **Agent Integration** —— 把可信 Operation view 转换成 DSH-native Agent / Preset / plugin composition。

Hostile-code strong isolation 继续属于 process / container / Pod。

## Canonical Runtime Ownership

v0.2 的结构 invariant 不变：

```text
Root -> Tenant -> Principal -> Operation
```

Tenant / Principal 是 canonical node。Creation 是 transaction：

```text
reserve
  -> unpublished Cordis subtree
  -> setup
  -> optional synchronous commit
  -> publish
```

Preparing creation 是 cancellable state。Registry teardown 先关闭 admission、取消 preparing transaction、drain 已发布 child，最后 dispose owner Fiber。

v0.1 ownership kernel 在整棵树中保持 shared。Context identity 只是 composition metadata，不是 durable authorization。

## Typed Capability Authority

Runtime capability 使用 `CapabilityToken<T, Scope>`：

```text
stable Cordis service key
+ semantic TypeScript value type
+ lifecycle / authority scope
```

Scope：

```text
deployment -> tenant -> principal -> operation
```

Scope 是真实 authority，不是 metadata。非 deployment provider 必须在对应 Cordis scope 中 materialize capability；parent-scoped provider 不能依赖 descendant capability。

Cordis 仍然是唯一 service resolver / registry。`CapabilityToken`、`provideCapability()`、`getCapability()` 只是 Cordis 之上的 typed semantics，不建立第二套 DI。

## Composition Identity

`CompositionPlan` 有两级 identity：

```text
plan.fingerprint
  exact whole-plan product identity

scopeFingerprints[scope]
  某 authority scope 的 selected provider dependency closure
```

`scopeFingerprints[scope]` 避免无关 descendant change 错误 invalid parent canonical node。Operation-only provider revision 不应该改变 Tenant / Principal creation identity。

`RuntimeComposition` 解决另一个问题：一个 active product Runtime 不能混用 whole Plan。完全相同的 Plan join；同一 root 上 active whole-plan fingerprint 不同直接失败。

因此：

- scope-local fingerprint = canonical creation drift；
- whole-plan attestation = product Runtime composition integrity。

## One-shot Operation

Cordis `ctx.inject()` 是 dependency-reactive；dependency 消失/恢复时 callback 可能重跑。这适合 plugin lifecycle，不适合一次 user transaction。

Principal-owned Operation：

1. 创建 ephemeral child Fiber；
2. 按 bound Plan materialize Operation-scoped provider；
3. required typed capability 只 capture 一次；
4. semantic `execute()` 只调用一次；
5. deterministic drain Fiber。

Bound product Operation 只能请求其 `RuntimeComposition` Plan 已声明的 capability。

Capability snapshot 固定的是 selection，不是任意对象内部的 deep immutability。如果 capability value 是 mutable client/resource，它自身的 lifetime contract 仍由 provider 负责。v0.3 不承诺 arbitrary provider hot reconfiguration。

## Product Ingress / Credentials

`createProductIngress()` 从 authentication 之后开始：

```text
trusted subject -> resolver -> TenantPrincipal -> RuntimeComposition.principal()
```

第一个具体 product-facing capability 是 `principalCredentials`：Principal-scoped `CapabilityToken<PrincipalCredentials, 'principal'>`。Provider 随 Principal lifecycle recreation / isolation，并通过同一套 Operation snapshot 消费。

Vendor authentication 与 production secret-store implementation 不进入 Core。

## Agent Boundary

Runtime capability 不会自动变成 Agent state。Agent Integration 必须显式：

```text
Operation snapshot
  -> integration recipe
  -> ownerCtx.agents.create/resume
  -> DSH Agent setup(agentCtx)
  -> DSH-native tools/plugins/listeners
```

不要复制 Cordis private isolation map 到 `Agent.ctx`，不要创建平行 Agent tenant registry。

## Security Boundary

本包保证：durable Session ownership、可信同进程且 conforming provider 下的 Tenant / Principal capability isolation、deterministic lifecycle/composition check。

本包不保证：process memory、filesystem、shell、network isolation，也不能防恶意同进程 plugin。Strong isolation 属于 deployment architecture。
