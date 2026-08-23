[English](./saas-composition.md) | 简体中文

# Spec —— SaaS Composition Model

> Status：P0 design contract。本文暂不冻结 public implementation。

## 问题

v0.2 已经提供 canonical Tenant / Principal Runtime Node 与 scoped capability ownership。v0.3 需要增加一层很薄的 SaaS 语义：需要哪些 capability、谁提供、属于哪个 Runtime scope、以及这张 graph 能否在用户流量进入前完成校验。

它**不能**变成第二套 DI Container。

## 三种 Representation

用户意图、验证后的结构、live runtime state 必须分开：

```text
SaaSDefinition
  human / distribution intent
        ↓ normalize + validate
CompositionPlan
  immutable executable structure
        ↓ bootstrap
Runtime Composition
  Cordis-backed live capability graph
```

### `SaaSDefinition`

面向配置、可变的输入，可以包含 default、optional selection、无序 provider declaration。Runtime execution 不能直接信任它。

### `CompositionPlan`

完成 normalize 后保持 immutable。所有 required capability 都已绑定，scope placement 合法，dependency 无环，provider cardinality 已解析，bootstrap 顺序确定。

Runtime 不应反复重新解释 raw `SaaSDefinition`。

### Runtime Composition

Plan 应用到已经存在的 Runtime 结构：

```text
Deployment / Root
  ↓
Tenant
  ↓
Principal
  ↓
Operation
```

Capability 继续使用 Cordis 原生 service / context / fiber 语义实现。Composition 层不拥有平行 service registry。

## P0 Scope Vocabulary

P0 只认四种语义 ownership level：

- `deployment` —— 一个 application / runtime process；
- `tenant` —— 属于一个 canonical Tenant；
- `principal` —— 属于 Tenant 下的一个 canonical Principal；
- `operation` —— 从 Principal 派生的一次 ephemeral work。

这些名称描述 lifecycle / ownership，不代表四种 package。

## Slot 语义

Capability slot 描述 composition graph 中的 requirement，不是 implementation registry。

P0 至少需要表达：

- 稳定 semantic capability key；
- ownership scope；
- required / optional；
- 只有真实场景需要时才支持 single / multiple provider cardinality；
- provider 对其他 capability key 的 dependency；
- 存在默认实现时的 deterministic selection。

在第一个 vertical slice 没有明确需求前，不引入 generic policy language、priority、condition 或任意 hook graph。

## Validation Invariant

`SaaSDefinition -> CompositionPlan` 遇到以下状态必须在 bootstrap 前失败：

1. required capability 没有 provider；
2. exclusive slot 出现多个 provider；
3. provider 被放到不兼容的 scope；
4. dependency graph 出现 cycle；
5. provider 依赖一个从其 ownership scope 不可见的 capability；
6. 多个 declaration normalize 到同一个 canonical composition identity，但 definition 冲突。

Error 必须有语义、可机器区分。最终名字现在不冻结，但 taxonomy 至少对应 missing capability、duplicate provider、scope mismatch、dependency cycle 等条件。

## Dependency Visibility Rule

Provider 只能依赖它挂载 Context 中可见的 capability。P0 优先从结构上拦截非法 upward / sibling dependency，而不是等运行时检查。

概念结构：

```text
deployment -> tenant -> principal -> operation
```

Child 可以消费可见 ancestor capability；parent 不应隐式进入某一个 child；Principal sibling 之间不能读取彼此 capability state。

## Bootstrap Transaction

Plan application 复用现有 publication vocabulary，不再发明第二套 lifecycle：

```text
validated CompositionPlan
        ↓
在 unpublished Runtime scope 上 prepare provider
        ↓
await provider setup
        ↓
需要最终外部 publication boundary 时执行同步 commit
        ↓
publish Runtime node
```

Provider bootstrap 失败时，不能留下 partially published canonical Tenant / Principal graph。

## Provider Contract Boundary

Provider 仅仅能调用 `ctx.provide()`，不代表它 compatible。

仓库自己的 conformance 必须继续验证：

- Tenant A/B isolation；
- Principal sibling isolation；
- ancestor inheritance 正确；
- root / parent 不泄漏；
- teardown isolation；
- clean recreation；
- unpublished setup compatibility。

现有 `dsh-multi-tenant/testing` contract 是起点，不是再造 Provider Framework 的理由。

## P0 Non-goals

P0 不定义：

- 具体 OAuth / JWT provider；
- credential vault 产品；
- MCP vendor / server schema；
- HTTP / WebSocket transport；
- audit / usage storage；
- Marketplace 或 Distribution bundle；
- dynamic runtime reconfiguration semantics；
- generic plugin marketplace protocol。

## 第一条 Implementation Proof

第一版实现只用 fake / test capability，打通：

```text
SaaSDefinition
  -> CompositionPlan
  -> Tenant
  -> Principal
  -> Operation
  -> explicit capability acquisition
  -> DSH Agent creation
```

只有这条 vertical slice 全绿后，具体 Auth / Credentials / MCP implementation 才开始反向塑造 public provider contract。
