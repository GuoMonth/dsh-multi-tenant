[English](./saas-composition.md) | 简体中文

# Spec —— SaaS Composition

> Status：当前 v0.3 compiler / materialization contract。

## Pipeline

```text
SaaSDefinition                  mutable product intent
      ↓ compile
CompositionPlan                 normalized / deterministic / immutable
      ↓ materialize
RuntimeComposition              exact bound product Runtime
      ↓
Tenant -> Principal -> Operation
```

Compiler 负责 provider selection、dependency validation、scope visibility、deterministic bootstrap order；Cordis 负责 service resolution / lifecycle。

## Capability Identity

所有 capability 使用 `CapabilityToken<T, Scope>`，让 key / type / scope 不能彼此独立漂移。

Provider dependency 引用 token，不用 untyped string。Compiler 会拒绝：duplicate / unknown capability、required provider 缺失、ambiguous selection、token scope mismatch、descendant visibility violation、dependency cycle，以及非 deployment ambient provider 假装拥有 scoped capability。

## Immutable Plan

`compileSaaSDefinition()` 把等价输入排序/normalize 成 immutable Plan：

- selected capabilities / providers；
- deterministic `bootstrapOrder`；
- whole `fingerprint`；
- per-scope `scopeFingerprints`。

Callback object identity 不进入 fingerprint。会影响 creation semantics 的 provider config 必须通过稳定 `definitionKey` 表达。

## Global identity vs canonical local identity

```text
plan.fingerprint
  exact whole Plan identity / RuntimeComposition attestation

plan.scopeFingerprints[scope]
  该 scope selected provider dependency closure
```

Scope fingerprint 只包含该 scope provider 和它真实依赖到的 selected ancestor provider；无关 descendant 不进入。

结果：

- Operation-only change -> Operation fingerprint 变化，Tenant / Principal 可以不变；
- Principal-only change -> Principal 变化，无关 Tenant 不变；
- Tenant / Principal 真正依赖的 Deployment provider 改变 -> dependent scope fingerprint 必须变化。

## Materialization

Low-level helper 仍保留：

```text
bootstrapDeploymentComposition(plan)
tenantDefinitionFromPlan(plan)
principalDefinitionFromPlan(plan)
operationDefinitionFromPlan(plan)
```

它们是 framework primitive，不再是推荐的 product composition surface。

产品代码使用：

```ts
const runtime = await materializeRuntimeComposition(ctx, plan)
const principal = await runtime.principal({ tenantId, userId })
```

`RuntimeComposition` 绑定 exact whole Plan，并从后续 Tenant / Principal / Operation creation API 中移除 Plan 参数。同一 root 上 active whole Plan 不同会失败，不会因为同 key service 恰好存在就静默吃错 implementation。

## Provider Setup / Publication

每个 scope 的 selected provider 按 topological order 执行。Required dependency 必须先在 scoped Context 中 resolve。Managed setup 可以返回同步 `{ commit() }`；只有 preparation 全部成功后才 commit。

Tenant / Principal setup 成功前不可发布；Operation setup 在 one-shot capability snapshot 之前完成。

## Bound Operation Requirements

Product-facing composed Principal 只能请求 Plan 已声明的 capability token，防止 bound path 读取 intended composition 之外的 ambient same-key capability。

## Non-goals

- 第二套 DI / provider container；
- deep clone capability value；
- arbitrary active Plan hot mutation；
- 用 package name 充当 scope；
- implementation 没证明前预先拆 Auth / MCP package topology。
