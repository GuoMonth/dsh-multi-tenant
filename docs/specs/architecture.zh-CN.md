[English](./architecture.md) | 简体中文

# 架构 —— Trusted Ingress、Typed Runtime、One-shot Operation、Native Agent Integration

本文档是 `dsh-multi-tenant` v0.3 的当前架构权威。

设计目标不是把 tenant check、provider registry、protocol adapter 扩散到 API 各处，而是让每个 concern 都有一个明确的结构 owner，使产品能力从 topology 自然生长，而不是不断叠 middleware patch。

## 1. 端到端 Topology

```text
Product / Transport
      ↓ 产品自己完成 authentication
Trusted Subject
      ↓ identity resolution
Product Ingress Boundary
      ↓
TenantPrincipal
      ↓
Deployment / Root
  ├─ TenantSessionStore               durable ownership seam
  ├─ MultiTenantService               fail-closed authorization kernel
  └─ TenantRuntimeService
       └─ Tenant                      canonical capability node
            └─ Principal             canonical capability node
                 └─ Operation        ephemeral one-shot work
                      ↓ typed immutable capability snapshot
                 Agent Integration
                      ↓ DSH-native setup/plugins
                 DeepSeek Harness
```

这套 topology 刻意拆开四个问题：

1. **谁有资格以可信身份进入 Runtime？** —— Product Ingress；
2. **谁拥有长期 capability state？** —— Deployment / Tenant / Principal Runtime scope；
3. **谁拥有一次用户可见 execution？** —— Principal Operation；
4. **可信 Runtime state 如何变成 Agent behavior？** —— 显式 DSH-native Agent Integration。

这些是 semantic plane，不是 package name。

## 2. Product Ingress 发生在 Runtime Capability Ownership 之前

Framework Core 不解析 JWT、Cookie、OAuth/OIDC、SAML 或厂商 authentication protocol。

产品先完成 authentication，再把 trusted subject 交给 identity resolution boundary：

```text
trusted product subject
        ↓
identity resolver
        ↓
TenantPrincipal { tenantId, userId }
```

这个 identity 用来选择 canonical Tenant / Principal topology。

因此 Authentication 不能仅仅因为是 SaaS concern，就被建模成一个长期 Principal capability。Product Ingress 与 Runtime capability ownership 是不同边界。

## 3. Canonical Runtime Tree

Tenant / Principal 是 live runtime node，不是 request DTO。

```ts
interface RuntimeScope<K, I> {
  readonly kind: K
  readonly identity: Readonly<I>
  readonly ctx: Context
  readonly state: 'active' | 'disposing' | 'disposed'
  dispose(): Promise<void>
}

interface RuntimeScopeRegistry<Key, Scope, Definition> {
  get(key: Key): Scope | undefined
  ensure(key: Key, definition?: Definition): Promise<Scope>
}
```

Principal 结构上嵌套在 Tenant 下。Principal registry 只接受 `userId`；`tenantId` 由 parent Tenant 决定，因此 cross-Tenant Principal binding 不是正常可表达的 creation path。

Principal 还结构性拥有 ephemeral Operation：

```ts
interface PrincipalRuntimeScope extends RuntimeScope<'principal', TenantPrincipal> {
  readonly operations: PrincipalOperationRegistry
}
```

## 4. Canonical Creation 是 Transactional 的

Tenant / Principal setup 完成前不可见：

```text
ABSENT
  ↓ reserve identity
PREPARING                    get() 不可见
  ↓ create isolated Cordis subtree
  ↓ await setup(signal)
  ↓ optional synchronous commit()
ACTIVE / published
```

Failure / cancellation 会 dispose unpublished subtree，并回到 ABSENT。

同一个 canonical identity 的并发 `ensure()` 会 single-flight 到一个 creation transaction。Parent teardown 先 close admission、cancel preparing child、drain published child，最后才 dispose owner Fiber。

## 5. CapabilityToken 绑定 Semantic Identity

Runtime capability identity 使用：

```ts
CapabilityToken<T, Scope>
```

它把：

```text
stable Cordis service key
+ TypeScript value type
+ lifecycle / authority scope
```

绑定成一个语义对象。

例如：

```ts
const credentials = defineCapability<Credentials, 'principal'>(
  'credentials',
  'principal',
)
```

Token **不会**创建新 service registry。`provideCapability()` / `getCapability()` 只是 Cordis `ctx.provide()` / `ctx.get()` 的 typed facade。

Cordis 仍然是唯一 service resolution / lifecycle substrate。

## 6. Scope 是 Authority，不是 Metadata

Runtime scope：

```text
deployment -> tenant -> principal -> operation
```

Capability token 只能拥有其中一个 semantic scope：

- deployment —— process / application 级；
- tenant —— 一个 canonical Tenant 拥有；
- principal —— 一个 canonical Principal 拥有；
- operation —— 一个 ephemeral Operation 拥有。

外部已经 mount 的 ambient capability 可以是 deployment scope。Tenant / Principal / Operation provider 必须真的在对应 isolated Cordis scope 内创建自己的 capability。

这可以阻止“声明 Principal credentials，实际却继承一个 root-global secret service”这种假隔离。

## 7. SaaSDefinition 编译成 Immutable CompositionPlan

Mutable product / distribution intent 不是 Runtime truth：

```text
SaaSDefinition
      ↓ compile / validate
CompositionPlan
      ↓ materialize
Cordis-backed Runtime scopes
```

Compiler 负责：

- typed capability declaration；
- provider selection；
- dependency graph validation；
- dependency visibility；
- cycle detection；
- deterministic bootstrap order；
- whole-plan 与 scope-local structural identity。

Runtime execution 不会反复解释 raw Definition。

## 8. Composition Identity 必须 Local

Plan 有两类 identity：

```text
plan.fingerprint
    exact whole-plan structural identity

plan.scopeFingerprints[scope]
    该 scope 自己拥有的 provider
    + 它们真正依赖到的 selected ancestor provider closure
```

Canonical Tenant / Principal definition 使用自己的 **scope-local dependency-closure fingerprint**。

结果是：

```text
只改 Operation provider
  -> whole Plan + Operation slice 变化
  -> 不 invalidate 无关 Principal / Tenant

只改 Principal provider
  -> Principal slice 变化
  -> 不 invalidate 无关 Tenant

Tenant 真正依赖的 ancestor provider 变化
  -> Tenant slice 变化
  -> 对 active incompatible Tenant 明确抛 RuntimeDefinitionConflictError
```

这不是 hot reconfiguration。v0.3 不原地修改 active canonical node 的 creation recipe；local creation identity 改变时应该 recreate 受影响 scope。

## 9. Operation 是 One-shot Semantic Work

Cordis `ctx.inject()` 是 dependency-reactive 的。Provider 消失再恢复时 callback 可能 unload / rerun。这对 long-lived plugin 是正确语义，但不能定义一次 user transaction。

Principal Operation 因此拥有独立 non-reactive lifecycle：

```text
Principal
  └─ Operation owner Fiber
       ↓ materialize Operation-local providers
       ↓ 一次性 capture required CapabilityToken values
       ↓ immutable snapshot
       ↓ semantic work execute exactly once
       ↓ deterministic teardown
```

典型 API：

```ts
const operation = principal.operations.start({
  ...operationDefinitionFromPlan(plan),
  requires: [agents, credentials],
  async execute({ capabilities, signal }) {
    const dshAgents = capabilities.require(agents)
    const credential = capabilities.require(credentials)
    // semantic work 只执行一次
  },
})
```

Capture 以后 provider churn 可能让真实 provider 不可用，但绝不会 re-enter `execute()`。

Principal dispose 会先关闭 Operation admission，并 drain active / preparing Operation，再完成 Principal teardown。

## 10. Agent Integration 是独立 Boundary

Runtime capability ownership 不等于 DSH Agent / Preset registration。

显式 seam：

```text
Operation snapshot
      ↓
Agent Integration
      ↓
ownerCtx.agents.create / resume
      ↓
DSH Agent setup(agentCtx)
      ↓
native DSH tools / prompts / listeners / plugins
```

Runtime layer 明确不做：

- 复制 Cordis 私有 isolation map 到 `Agent.ctx`；
- 把 Tenant 强行作为 DSH Agent / Preset ancestry 的第二 parent；
- 再造 Agent-specific tenant service registry；
- 用本地 wrapper protocol 替代 DSH plugin loading。

真实 DSH AgentRegistry 的 executable evidence 已证明 create / resume 会收到 caller-bound Operation / Principal `ownerCtx`。

## 11. MCP 当前首先是 Agent Integration Reference Path

在 pinned DSH baseline 中，`@deepseek-ai/dsh-mcp-client` 是原生 Cordis plugin，把 MCP **Tools** bridge 到 `ctx.tools`。

所以下一条真实 MCP proof 应该是：

```text
Tenant MCP configuration
        +
Principal credentials
        +
Operation snapshot
        ↓
Agent Integration
        ↓
DSH Agent setup
        ↓
@deepseek-ai/dsh-mcp-client
        ↓
native DSH Tools
```

MCP 不提前被定义成一个扁平 Runtime Provider slot，因为 integration 本身会同时消费多个 Runtime capability，再 materialize DSH-native Agent behavior。

Pinned Harness 当前没有 bridge MCP Resources / Prompts。v0.3 不为了模拟不存在的 consumer 去造平行 compatibility protocol。

## 12. Persistent Authorization 是独立 Defense in Depth

Runtime identity helper（`runtimeIdentityOf`、`tenantIdOf`、`principalOf`）只暴露 trusted same-process composition metadata，不是 durable authorization decision。

Session / durable boundary 继续使用 `MultiTenantService` + `TenantSessionStore`：

```text
(tenantId, userId) -> session ownership
```

保持 claim-once immutable ownership 与 fail-closed access check。

## 13. Provider Compatibility 必须 Executable

Plugin 能挂到 Context 下，并不代表 tenant-safe。它仍然可能通过 root state、module global、process env、外部共享 state 泄漏。

`dsh-multi-tenant/testing` 继续保护 Runtime provider invariant：

- Tenant A/B isolation；
- Principal sibling isolation；
- ancestor inheritance；
- root / parent 不泄漏；
- teardown isolation；
- clean recreation；
- unpublished setup ownership。

未来 Product Ingress / Agent Integration 也必须有自己的 executable conformance，不能因为“Provider 已证明”就类推安全。

## 14. Package Topology 跟随真实 Boundary

当前 public topology 继续保持一个 package：

```text
dsh-multi-tenant
├─ runtime
├─ operation
├─ composition
├─ store
└─ testing
```

不预建 `dsh-saas`、Auth 或 MCP package。

只有 implementation 真正证明独立 consumer API、replacement/lifecycle boundary、release cadence 或 Distribution boundary，才创建 package。

## 15. Strong Isolation 仍由 Deployment 拥有

Cordis Context 是 trusted same-process capability / lifecycle structure，不是 hostile-code sandbox。它不隔离 process memory、filesystem、shell、network、environment variable 或 malicious same-process plugin。

Strong isolation 属于 process/container/Pod 等 deployment profile。

## 16. Compatibility Baseline

当前精确 DSH baseline 与 executable evidence policy 见 [`../reference/compatibility.zh-CN.md`](../reference/compatibility.zh-CN.md)。Architecture code 不依赖 floating upstream state。
