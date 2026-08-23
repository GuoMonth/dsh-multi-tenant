[English](./architecture.md) | 简体中文

# 架构 —— Canonical Runtime，职责 Plane 明确分离

本文档是 `dsh-multi-tenant` v0.2 的当前架构权威，也是 v0.3 SaaS Framework 应该直接组合的基础。

设计目标不是把 tenant check 扩散到每个 API，而是让 tenancy 成为 Runtime 的结构属性，使 identity、capability resolution 与 lifecycle ownership 遵循同一模型。

## 1. Canonical Runtime Tree

```text
Deployment / Root
│
├── TenantSessionStore                 shared durable ownership seam
├── MultiTenantService                 shared fail-closed authorization kernel
├── TenantRuntimeService               canonical runtime root
│
├── Tenant(acme)                       canonical capability node
│   ├── tenant-local providers
│   ├── Principal(alice)               canonical capability node
│   │   ├── principal-local providers
│   │   └── derived integration fibers
│   │       └── Agent / transport / provider operations
│   └── Principal(bob)
│
└── Tenant(globex)
```

Tenant / Principal 不是 request DTO，而是拥有 identity、Context、lifecycle 与 canonical registry 语义的真实 Runtime Node。

Principal 结构上嵌套在 Tenant 下。Principal registry 只以 `userId` 为 key，`tenantId` 来自父 Tenant，因此错误的 cross-tenant Principal 组合不是靠一个 `if` 拦截，而是 public data model 本身无法表达。

## 2. 统一 Runtime Node 语义

Tenant / Principal 共用一个基础抽象：

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

Tenant 只增加结构上真正属于它的 Principal Registry。

新功能应该从这棵树自然组合，而不是继续增加 `createTenantForRequest`、`createPrincipalForAgent` 之类特殊方法。

## 3. Runtime Identity 与 Creation Recipe 分离

一个 Runtime Node 有两个不同问题：

- **identity** —— 调用方要加入哪个 canonical node；
- **definition** —— 这个 node 不存在时应该如何创建。

消费层可以只凭 identity 获取已有 node：

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme')
```

Bootstrap / configuration 层才负责 creation recipe：

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', {
  isolateServices: ['tenantAuth', 'tenantMcp'],
  setup: async ({ ctx, signal }) => {
    await ctx.plugin(authProvider)
    await ctx.plugin(mcpProvider)
  },
})
```

这样 Transport / Agent 等上层 consumer 不需要知道底层 provider 配方。只有显式再次提供 definition 时才做 definition-drift 校验。

## 4. Publication Transaction

异步配置不能让半初始化 Tenant / Principal 对外可见。

```text
ABSENT
  │ ensure(identity, definition)
  ▼
RESERVED / PREPARING              get() 不可见
  │
  ├─ prepare isolated Cordis subtree
  ├─ await setup(signal)
  ├─ optional synchronous commit()
  │
  ├──────── success ───────────────► ACTIVE / published
  │
  └──────── failure/cancel ────────► rollback -> ABSENT
```

可选同步 `commit()` 拥有精确 publication boundary，用于必须在 visibility 前最终确认的外部 mutable state。这个语义刻意与 DSH Agent 的 unpublished setup / publication 模型保持同构。

同一个 key 的并发 `ensure()` single-flight 到同一个 creation transaction。

## 5. Preparing Transaction 是 Lifecycle Resource

Preparing scope 不能只表示成 `Promise<Scope>`。否则 parent teardown 可能等待一个只有自己才能取消的 pending child，形成自等待。

Registry 内部因此需要类似下面的 first-class creation resource：

```ts
interface RuntimeCreation<Scope> {
  readonly ready: Promise<Scope>
  cancel(reason: unknown): Promise<void>
}
```

Registry teardown 顺序统一为：

```text
OPEN
  ↓ close admission
CLOSING
  ↓ cancel all preparing creations
  ↓ dispose/drain all published scopes
CLOSED
```

Tenant dispose 先关闭并 drain Principal registry，再回收 Tenant Cordis fiber。相同 canonical identity 的 replacement 不允许与旧 graph 的 draining 生命周期重叠。

## 6. 四个独立 Plane

Tenancy 不是一个机制包办所有职责。

| Plane | Owner | 作用 |
| --- | --- | --- |
| Persistent authorization | `MultiTenantService` + `TenantSessionStore` | Durable session ownership；fail closed。 |
| Tenant / Principal capability graph | Cordis Context service isolation | Auth / MCP / credential / provider resolution 与 lifecycle。 |
| Agent / Preset registration graph | DSH `@deepseek-ai/dsh-scope` | Agent-local tools、prompt、listener 与 model-facing visibility。 |
| Strong isolation | Deployment / container / K8S | Process、filesystem、shell、network、memory boundary。 |

前两层是 defense in depth，不是互相替代。Context identity 只属于 trusted same-process composition metadata，绝不替代 persistent ownership authorization。

## 7. Principal Context 与 Integration Fiber

Principal Context 是 canonical capability root，不是绕过 Cordis dependency injection 的万能 Context。

需要额外 service 的具体 operation 从 Principal 派生 integration fiber，并显式 inject：

```ts
const alice = await tenant.principals.ensure('alice')

const operation = alice.ctx.inject(['agents'], async (ownerCtx) => {
  return ownerCtx.agents.create({
    sessionId,
    setup(agentCtx) {
      const credentials = ownerCtx.get('userCredentials')
      // 把 Agent-local DSH registration 组合到 agentCtx。
    },
  })
})

await operation
```

未来 HTTP / WebSocket request scope、Agent orchestration、tracing、operation-local cancellation 都可以自然落在这一层，而不用把 ephemeral state 塞进 canonical Principal Node。

## 8. Agent Boundary

当前 DSH Agent creation 会把 `ctx.agents.create()` 的 caller Context 作为 `ownerCtx` 传入 factory。Runtime 直接使用这个 public seam。

明确不做：

- 复制 Cordis 私有 isolation map 到 `Agent.ctx`；
- 把 Tenant 强塞成 DSH Agent / Preset scope ancestry 的第二个 parent；
- 再造 Agent-specific tenant service registry。

正确结构是：

```text
Principal capability root
       ↓ derived fiber (inject agents)
DSH ownerCtx boundary
       ↓ setup composition
DSH Agent / Preset scope
```

两张 graph 负责不同语义，因此可以稳定组合。

## 9. Provider Contract

Provider 能挂载到 Context 下，并不代表它天然 tenant-safe。它仍可能通过 root state、module global、process env 等方式绕过 scope。

`dsh-multi-tenant/testing` 提供 executable Runtime Capability Provider Contract，验证：

- 同名 Tenant A/B isolation；
- root / parent 不泄漏；
- 正确 descendant inheritance；
- Principal sibling isolation；
- dispose 一个 scope 不影响另一个；
- recreate 不残留 stale state；
- provider 能在 unpublished setup 中正确挂载。

Provider compatibility 是 contract，不是默认假设。

## 10. Dependency Direction

架构只向上生长：

```text
v0.1 ownership kernel
        ↑
v0.2 Runtime Contract
        ↑
capability contracts
        ↑
replaceable providers / integrations
        ↑
v0.3 SaaS Distribution / Framework
```

Runtime package 不引入 transport / vendor implementation。未来 SaaS Distribution 可以提供 Auth、credentials、MCP、storage、audit、transport 的官方默认实现，但 provider slot 必须保持可替换。

## 11. v0.3 Composition Target

```text
                         dsh-saas
                 SaaS Distribution / Framework
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
      Auth              Credentials            MCP
        │                   │                   │
    Transport              Audit              Usage
        │                   │                   │
        └──────────── Provider Contracts ───────┘
                            │
                   dsh-multi-tenant
                 Runtime Contract + Kernel
```

这是一张 **capability / composition map，不是 package map**。Auth、Transport、MCP 等名称描述的是职责；只有独立 consumer API、replacement boundary、lifecycle 或 release boundary 被证明后，它们才应成为独立 package。

Framework 提供开箱即用的产品体验与 opinionated defaults；Plugin Family 提供可替换、可组合的工程架构。

## 12. Explicit Boundary

Cordis Context 是 trusted same-process capability / lifecycle structure，不是 hostile-code sandbox。它不隔离任意 process memory、filesystem、shell、network、environment variable，也不能约束故意访问 root / process API 的代码。

Strong isolation 属于 one Tenant per process / container / Pod 等 deployment profile。

## 13. Compatibility Baseline

当前精确 DSH baseline 与 executable evidence policy 见 [`../reference/compatibility.zh-CN.md`](../reference/compatibility.zh-CN.md)。Architecture code 不依赖 floating upstream state。
