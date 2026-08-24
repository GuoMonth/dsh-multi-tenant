[English](./saas-composition.md) | 简体中文

# Spec —— SaaS Composition Model

> Status：**v0.3 M1–M3 之后已实现并完成 hardening**。Live model 由 compiler test、scope-local canonical drift test、packed-consumer smoke 与 pinned DSH vertical proof 持续保护。

## 目标

v0.2 负责 canonical Tenant / Principal lifecycle。v0.3 只增加 SaaS 真正需要的语义层，用来回答：

- 一套 composition 由哪些 typed capability 构成；
- 每个 capability 选中哪个 provider；
- capability 真正属于哪个 Runtime scope；
- selected provider 依赖哪些 capability；
- 用户流量进入前整张 graph 是否合法；
- canonical Runtime node 是否已经运行着冲突的 **local creation slice**。

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

## Typed Capability Identity

Capability 不再由彼此独立的 string / scope 字段表示。

```ts
const credentials = defineCapability<Credentials, 'principal'>(
  'credentials',
  'principal',
)
```

`CapabilityToken<T, Scope>` 把三件不能独立漂移的事实绑定起来：

```text
stable service key
+ semantic TypeScript value type
+ lifecycle / authority scope
```

Token 只是 Cordis service key 之上的 typed identity。`provideCapability()` / `getCapability()` 只是 `ctx.provide()` / `ctx.get()` 的薄 typed facade，不拥有 storage 或 resolution。

这样可以从数据结构层面消除两类错误：

- 同一 capability 在一个地方声明 tenant scope，另一个地方又声明 principal scope；
- consumer 通过 `require<MyType>('credentials')` 自己声称返回类型是什么。

## SaaSDefinition

Definition 使用 capability token、provider candidate、可选 selection 与 dependency edge：

```ts
interface CapabilityDefinition {
  capability: CapabilityToken
  required?: boolean
  defaultProvider?: string
}

interface CapabilityProviderDefinition {
  id: string
  capability: CapabilityToken
  requires?: readonly CapabilityToken[]
  definitionKey?: string
  setup?: CapabilityProviderSetup
}
```

Runtime 不会反复解释 mutable Definition。

## CompositionPlan

Compiler 在 Runtime bootstrap 前消除所有歧义。Plan 包含：

- normalized typed capability binding；
- selected provider definition；
- deterministic topological bootstrap order；
- global structural `fingerprint`，用于精确 whole-plan comparison / diagnostics；
- Deployment / Tenant / Principal / Operation 的 `scopeFingerprints`。

Fingerprint 不包含 JavaScript callback object identity。当 config 会改变 semantic creation recipe 时，provider author 使用稳定 provider id 加可选 `definitionKey` 表达身份。

## Scope 必须是真实 Authority

Scope 是 lifecycle / authority 语义：

```text
deployment -> tenant -> principal -> operation
```

- deployment —— application / process 级 capability；
- tenant —— 归属于一个 canonical Tenant；
- principal —— 归属于一个 canonical Principal；
- operation —— 归属于一个 ephemeral Principal Operation。

非 deployment provider 必须真的在声明 scope 内 materialize。外部已经挂载好的 ambient capability 只能是 deployment scope。

这样可以阻止“声明 principal credentials，实际上却继承 root service”这种假隔离。

## Compile-time Invariant

`compileSaaSDefinition()` 会在 Runtime bootstrap 前拒绝：

- duplicate capability declaration；
- duplicate provider id；
- unknown provider / dependency / selection capability；
- 同一 key 的 capability token scope 不一致；
- required capability 没有 provider；
- provider selection 有歧义；
- explicit/default selection 非法；
- ambient provider 假装拥有 Tenant / Principal / Operation scope；
- unbound dependency；
- dependency visibility violation；
- dependency cycle。

Error 保持语义化并可机器区分。

## Dependency Visibility

Provider 只能依赖其 Context 中真实可见的 capability：

```text
deployment -> tenant -> principal -> operation
```

Child 可以消费 ancestor；parent 不能消费 descendant；Principal sibling 不能互相依赖。

## Global Identity 与 Canonical Local Identity

MR-A 初版直接把整个 Plan fingerprint 用作 Tenant / Principal canonical definition identity。这个方案安全，但粒度过粗：只改一个无关 Operation provider，也可能错误地让 Tenant 发生 definition conflict。

Hardening 后明确拆成：

```text
CompositionPlan.fingerprint
  = exact whole-plan structural identity

CompositionPlan.scopeFingerprints[scope]
  = 该 scope 自己拥有的 provider
    + 它们真正依赖到的 selected ancestor provider closure
```

例如：

```text
只改 Operation provider
  -> global fingerprint 变化
  -> Operation fingerprint 变化
  -> Principal fingerprint 不变
  -> Tenant fingerprint 不变

只改 Principal provider
  -> Principal fingerprint 变化
  -> Tenant fingerprint 不变

Tenant 真正依赖的 Deployment provider 变化
  -> Tenant fingerprint 变化
```

Canonical Tenant / Principal Runtime definition 使用自己的 **scope fingerprint**，而不是 whole Plan fingerprint。

这样同时保持：

- 真实 creation drift 仍然通过 `RuntimeDefinitionConflictError` 明确失败；
- 无关 descendant 演进不会制造 false parent conflict。

v0.3 仍然不定义 active canonical node 的 hot mutation。需要改变 creation recipe 时，应该 recreate 受影响的 slice，而不是模糊地原地切换。

## Materialization Transaction

```text
validated CompositionPlan
      ↓
isolate owned capability service names
      ↓
按 dependency order prepare selected provider
      ↓
验证 dependency visibility
      ↓
await setup
      ↓
验证 capability 确实 materialize
      ↓
optional synchronous commit
      ↓
publish canonical scope / activate Operation
```

Tenant / Principal 继续使用现有 unpublished Runtime transaction。Deployment 与 Operation 各自由显式 Cordis owner Fiber 承担 lifecycle。

## Operation Consumption

Operation 直接消费 typed token：

```ts
const operation = principal.operations.start({
  requires: [agents, credentials],
  execute({ capabilities }) {
    const dshAgents = capabilities.require(agents)
    const credential = capabilities.require(credentials)
  },
})
```

返回类型由 token 决定。Operation 仍然只在 semantic execution 前一次性 capture value。

## Boundary Planes

Composition 只是 Framework 的一个 plane。Product identity ingress 与 Agent integration 是独立语义边界，参见 [`saas-boundaries.zh-CN.md`](./saas-boundaries.zh-CN.md)。

特别是，下一阶段不能继续把 Authenticated Identity、Credentials、MCP 当成三个等价 Provider slot：

- Identity 在 canonical Runtime selection 之前进入；
- Credentials 是 Principal-owned Runtime capability；
- MCP 更适合首先作为 Agent Integration 来验证：消费多个 Runtime capability，再进入 DSH-native seam。

## Package Boundary

本次 hardening 仍然不创建 `dsh-saas`。Typed capability、Composition、Runtime、Operation 目前仍然属于一套紧密的 lifecycle contract，继续留在 `dsh-multi-tenant` 内最轻。

只有未来出现真实独立 consumer/lifecycle/release boundary 时，package topology 才重新评估。

## Executable Evidence

- `packages/multi-tenant/tests/composition.test.ts` —— typed normalization、validation、scope authority、dependency-closure fingerprint、canonical locality；
- `packages/multi-tenant/tests/operation.test.ts` —— typed one-shot Operation snapshot 与 lifecycle；
- `scripts/saas-core-vertical-slice-probe.mjs` —— typed multi-tenant Plan -> Operation -> 真实 DSH AgentRegistry create / resume / failure；
- `scripts/package-smoke.mjs` —— packed npm artifact 证明同一 typed/locality contract。
