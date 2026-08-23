[English](./saas-composition.md) | 简体中文

# Spec —— SaaS Composition Model

> Status：**v0.3 M1 / M3 已实现**。当前模型由 deterministic compiler test、canonical Runtime drift test、packed-consumer smoke 与 pinned DSH vertical proof 持续保护。

## 目标

v0.2 负责 canonical Tenant / Principal lifecycle。v0.3 只增加 SaaS 真正需要的语义层，用来回答：

- 这套 SaaS composition 包含哪些 capability；
- 每个 capability 最终选中哪个 provider；
- 它真正属于哪个 Runtime scope；
- 它依赖哪些 capability；
- 用户流量进入前整张 graph 是否合法；
- 一个 canonical Runtime node 是否已经运行着另一套 composition。

它刻意**不是**第二套 DI Container。Service resolution、provider lifetime、Context isolation 与 Fiber cleanup 仍然属于 Cordis。

## 三种 Representation

```text
SaaSDefinition
  mutable intent
      ↓ compile
CompositionPlan
  normalized + deterministic + immutable
      ↓ materialize
Runtime Composition
  native Cordis providers in Deployment/Tenant/Principal/Operation scopes
```

### SaaSDefinition

Definition 是无序的 consumer / distribution intent，可以声明 required / optional capability、provider candidate、explicit/default selection 和 dependency edge。

Runtime 不会反复解释这个 mutable shape。

### CompositionPlan

Compiler 在 Runtime bootstrap 前消除所有歧义。Plan 包含：

- normalized capability binding；
- selected provider definition；
- deterministic topological bootstrap order；
- deterministic structural `fingerprint`。

Fingerprint 不包含 JavaScript callback object identity。因此，当 provider config 会改变 semantic creation recipe 时，provider author 必须通过稳定 provider id 加可选 `definitionKey` 表达身份。两个语义不同的 creation recipe 不能复用同一身份。

### Runtime Composition

Plan 直接 materialize 到已有 ownership graph：

```text
Deployment
   ↓
Tenant
   ↓
Principal
   ↓
Operation
```

不存在平行 `ProviderContainer`、`ServiceRegistry` 或本地 dependency resolver。

## Scope 必须是真实 Authority

四种 scope 名字是 lifecycle / authority 语义，不是标签：

- `deployment` —— application / process 级 capability；
- `tenant` —— 归属于一个 canonical Tenant；
- `principal` —— 归属于一个 canonical Principal；
- `operation` —— 归属于一个 ephemeral Principal Operation。

非 deployment provider 必须真的在它声明的 scope 内 materialize。因此：

- deployment provider 可以是 **ambient**（没有 `setup`），表示 capability 已经由外部 DSH/Cordis 提供；
- deployment provider 也可以由 Plan 自己管理；
- Tenant / Principal / Operation provider 必须提供 scoped `setup` materializer。

这样可以从类型和 compiler 层面阻止“声明 principal-scoped credentials，实际却继承 root service”这种假隔离。

## P0 Provider Shape

P0 contract 刻意保持小：

```ts
interface CapabilityDefinition {
  key: string
  scope: CapabilityScope
  required?: boolean
  defaultProvider?: string
}

interface ProviderBase {
  id: string
  capability: string
  requires?: readonly string[]
  definitionKey?: string
}
```

Provider setup 只拿真实 Cordis Context、semantic scope 与 cancellation signal，并可选返回同步 publication commit。

没有真实 vertical-slice 需求以前，不引入 priority、policy DSL、任意 hook graph 或 dynamic selection language。

## Compile-time Invariant

`compileSaaSDefinition()` 会在 Runtime bootstrap 前拒绝：

- duplicate capability declaration；
- duplicate provider id；
- provider 指向 unknown capability；
- required capability 没有 provider；
- provider selection 有歧义；
- explicit/default selection 非法；
- provider / capability scope 不一致；
- ambient provider 假装拥有 Tenant / Principal / Operation scope；
- provider dependency unknown / unbound；
- dependency visibility violation；
- dependency cycle。

Error 都具有语义并可机器区分。

## Dependency Visibility

```text
deployment -> tenant -> principal -> operation
```

Child scope 可以依赖可见 ancestor capability。Parent 不能依赖 descendant capability，Principal sibling 也不能互相依赖。

Compiler 在构造 Plan 时就拒绝不可能成立的 graph，而不是等生产环境 `ctx.get()` 才报错。

## Determinism 与 Canonical Drift

等价的无序 Definition 会得到同一个 normalized Plan、bootstrap order 与 fingerprint。

Plan 创建 canonical Tenant / Principal 时，生成的 Runtime definition 会携带：

```text
saas:<scope>:<plan fingerprint>
```

因此 v0.2 canonical definition contract 被扩展成：

- consumer 仍然可以只调用 `ensure(identity)`，不需要知道 creation recipe；
- equivalent Plan 可以显式 join 已存在 node；
- structurally different Plan 不能仅仅因为 isolated service name 一样，就悄悄复用已经 active 的 Tenant / Principal。

这种 drift 会直接抛出 `RuntimeDefinitionConflictError`。

v0.3 不定义 hot-adopt 新 Plan。Reconfiguration semantics 仍然是 non-goal；需要新结构时应该 recreate 相关 canonical graph，而不是模糊地原地变更。

## Materialization Transaction

Managed scope 的流程：

```text
validated CompositionPlan
      ↓
isolate capability service names
      ↓
按 deterministic dependency order prepare provider
      ↓
验证 required dependency
      ↓
await provider setup
      ↓
验证 target capability 确实可见
      ↓
optional synchronous commits
      ↓
publish canonical scope / activate Operation
```

Tenant / Principal setup 继续使用现有 unpublished Runtime transaction，因此 provider failure 不会暴露 partially prepared canonical node。

Deployment composition 由一个显式 Cordis child Fiber 拥有；Operation composition 由 one-shot Operation Fiber 拥有。

## Provider Compatibility 仍然必须 Executable

能调用 `ctx.provide()` 不代表 SaaS compatible。仓库证据继续保护：

- Tenant A/B isolation；
- Principal sibling isolation；
- ancestor inheritance；
- parent/root 不泄漏；
- teardown isolation；
- clean recreation；
- unpublished setup ownership；
- Operation one-shot semantics。

M4/M5 的具体 Auth / Credentials / MCP contract 应该在这套模型上自然生长，而不是重新改变 dependency / lifecycle substrate。

## Package Boundary Gate

M3 **不创建** `dsh-saas` package。

Composition + Operation 当前仍然是在扩展同一套 Runtime ownership contract，还没有证明足够独立的 versioning / distribution value，因此继续作为 `dsh-multi-tenant` 的 public subpath 导出。

Package decision 延后到 M4/M5。只有真实 capability contract 形成独立 consumer API、replacement/lifecycle boundary 或 distribution boundary 时，新 package 才应该从证据中自然长出来，而不是由 Roadmap 提前预测。

## Executable Evidence

- `packages/multi-tenant/tests/composition.test.ts` —— normalization、validation、scope truth、fingerprint、canonical drift；
- `packages/multi-tenant/tests/operation.test.ts` —— one-shot Operation lifecycle；
- `scripts/saas-core-vertical-slice-probe.mjs` —— multi-tenant Plan -> Operation -> 真实 DSH AgentRegistry create / resume / failure；
- `scripts/package-smoke.mjs` —— packed npm artifact 真实暴露并执行同一 Composition / Operation contract。
