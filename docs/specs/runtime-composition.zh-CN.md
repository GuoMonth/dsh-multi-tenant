[English](./runtime-composition.md) | 简体中文

# Spec —— RuntimeComposition Binding / Attestation

> 状态：当前 `0.3` product-facing composition contract。

## 问题

`CompositionPlan` 可以派生 Deployment / Tenant / Principal / Operation definition，但这些 low-level helper 本来就是彼此独立的 primitive。产品代码不能因为 capability key 恰好能 resolve，就允许 Deployment 用 Plan A、Tenant 用 Plan B、Operation 用 Plan C。

Scope-local fingerprint 解决的是 canonical creation locality；它本身不能证明一条产品请求链只使用了一张 whole Plan。

## Contract

`materializeRuntimeComposition(root, plan)` 建立产品侧绑定：

```text
CompositionPlan
   │ exact plan fingerprint
   ▼
RuntimeComposition
   ├─ Deployment materialization
   ├─ canonical Tenant join
   ├─ canonical Principal join
   └─ bound one-shot Operation
```

一个 root Context 同时最多存在一个 exact active RuntimeComposition：

- 同一个 `plan.fingerprint` join / single-flight；
- active whole-plan fingerprint 不同直接抛 `RuntimeCompositionConflictError`；
- quiescent dispose 后，同一个 root 才能 materialize 新 Plan。

## Attestation 与 Canonical Identity 分工

```text
plan.fingerprint
  whole product composition attestation

plan.scopeFingerprints.tenant / principal
  对应 Runtime scope 的 canonical creation identity
```

Operation-only change 可以不改变 Tenant / Principal scope fingerprint；但它已经是另一张 whole product Plan，不能静默加入已经 active 的 `RuntimeComposition`。

## Bound Handle

`ComposedTenant` / `ComposedPrincipal` 携带同一份 immutable `RuntimeCompositionAttestation`，creation API 不再接受另一张 Plan / definition。

Bound Principal Operation 只接受：

- `requires`；
- `execute`。

Operation-local provider setup / isolation 来自 bound Plan。Operation 请求的 capability 必须由该 Plan 声明，否则在 semantic work 之前抛 `RuntimeCompositionCapabilityError`。

Low-level Runtime 与 `*DefinitionFromPlan()` 仍保留给 framework / integration 使用，但产品代码应该优先使用 bound `RuntimeComposition` surface。

## Lifecycle

`RuntimeComposition` 拥有 deployment composition 和它暴露过的 Tenant。Dispose 顺序：

```text
close composition admission
  -> dispose touched Tenant
      -> drain Principal
          -> cancel/drain Operation
  -> dispose Deployment composition
  -> release root binding
```

这样 deployment capability 不会在 bound product Operation 仍运行时被提前拆掉。

## Non-goals

- active Plan hot mutation；
- 一个 root 上并行运行多套独立 product composition；
- 替代 Cordis service resolution；
- 把 attestation 当 authorization decision；
- hostile-code isolation。
