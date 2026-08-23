[English](./README.md) | 简体中文

# dsh-multi-tenant

面向 DeepSeek Harness（DSH）的 Context-native Multi-Tenant Runtime 原语。

> **v0.2 版本线：** 当前目标是把未来 SaaS Framework 所依赖的 Runtime Contract 收口。已经发布的 v0.1 tag 继续冻结为 immutable session ownership + fail-closed authorization 的历史契约。
>
> 在 Runtime Contract 稳定前，可执行 DSH compatibility target 继续保持已验证的 `0.1.0-rc.7` 依赖闭包。

## Runtime Model

v0.2 把多租户 Runtime 统一建模成一棵 canonical ownership tree：

```text
Deployment / Root
│
├── shared ownership kernel
├── shared TenantRuntimeService
│
├── Tenant(acme)                    canonical runtime node
│   ├── tenant capability graph
│   ├── Principal(alice)            canonical runtime node
│   │   └── principal capabilities
│   └── Principal(bob)
│
└── Tenant(globex)
```

DSH Agent / Preset 继续拥有自己独立的 registration scope plane。Principal Context 是 **Agent creation 的 owner / composition boundary**；Agent 需要的能力通过 setup 显式 projection / composition，而不是复制 Cordis 私有 isolation map 来伪造 `Agent.ctx` 的直接继承。

## Supported guarantee

v0.2 保留两层互相独立的保证：

1. **Context-native capability isolation** —— Tenant / Principal node 拥有真实 Cordis child lifecycle 与显式 service isolation label。
2. **Persistent ownership authorization** —— v0.1 `ctx.multiTenant` 保持 deployment-global，对 `(tenantId, userId)` session ownership 做不可变、fail-closed 的持久授权。

Runtime Contract 进一步保证：

- 每个 tenantId 最多一个 canonical active Tenant node；
- 每个 Tenant 内，每个 userId 最多一个 canonical active Principal node；
- Tenant / Principal 使用完全一致的 `ensure / get / state / dispose` 语义；
- preparing scope 永远不会从 `get()` 暴露；
- 同 key 并发 `ensure()` single-flight 到同一次创建；
- setup 在 scope 未发布时运行；
- setup 可以返回同步 `commit()`，在 visibility boundary 完成最终提交；
- setup 失败完整 rollback 未发布 subtree；
- active canonical node 遇到 capability definition drift 明确失败；
- Tenant dispose 先拥有并 drain 所有 Principal，再回收自身；
- ownership kernel 与 Cordis core service 禁止被 runtime isolation 隔离掉。

## Canonical Publication

```ts
const acme = await ctx.tenantRuntime.tenants.ensure('acme', {
  isolateServices: ['tenantAuth', 'tenantMcp'],
  setup: async ({ ctx: tenantCtx, identity, signal }) => {
    await tenantCtx.plugin(authProvider, acmeAuthConfig)
    await tenantCtx.plugin(mcpProvider, acmeMcpConfig)

    return {
      commit() {
        // 需要在 visibility boundary 最终确认的外部 mutable state
      },
    }
  },
})

const alice = await acme.principals.ensure('alice', {
  isolateServices: ['userCredentials'],
  setup: async ({ ctx: principalCtx }) => {
    await principalCtx.plugin(credentialsProvider, aliceCredentials)
  },
})
```

当 setup 仍在执行时：

```ts
ctx.tenantRuntime.tenants.get('acme') === undefined
```

只有完成 setup + commit 的 active node 才可见。

Tenant 与 Principal 共享同一个基础抽象：

```ts
interface RuntimeScope<K, I> {
  readonly kind: K
  readonly identity: Readonly<I>
  readonly ctx: Context
  readonly state: 'active' | 'disposing' | 'disposed'
  dispose(): Promise<void>
}
```

Principal registry 直接嵌套在 Tenant 下，因此 key 只需要 `userId`；`tenantId` 从父节点结构上获得，错误 tenantId 这种非法状态从数据结构层面就不存在。

## Agent Composition Boundary

当前 DSH Agent creation 已经把 `ctx.agents.create()` 的 caller Context 作为 `ownerCtx` 传给 Agent factory。v0.2 直接沿用这个真实 seam：

```ts
const alice = await acme.principals.ensure('alice')

await alice.ctx.agents.create({
  sessionId,
  setup(agentCtx) {
    const tenantMcp = alice.ctx.get('tenantMcp')
    // 在 agentCtx 上注册 tools / prompt / listeners 等 Agent-local contribution
  },
})
```

两套 scope plane 的职责明确分开：

- **Cordis Tenant / Principal service isolation**：capability authority 与 provider lifetime；
- **DSH Agent / Preset scope**：model-facing registration、Agent-local lifecycle 与 visibility。

仓库提供真实 DSH compatibility probe，直接执行 `@deepseek-ai/dsh-agent` 的 AgentRegistry 路径，证明 Principal caller/owner Context 与 A/B capability graph 在这个边界保持正确。

## Tenant-Safe Provider Contract

Provider 能挂在 Context 下，不代表它天然 tenant-safe。`dsh-multi-tenant/testing` 因此提供可执行 conformance harness：

```ts
await assertRuntimeCapabilityProviderContract({
  serviceName: 'myCapability',
  level: 'tenant', // 或 principal
  mount: async (ctx, marker) => { /* mount provider */ },
  fingerprint: async ctx => { /* 识别当前解析出的 provider instance */ },
})
```

Harness 会验证：

- 同名 A/B service 隔离；
- root / parent 不泄漏；
- 正确 descendant inheritance；
- sibling 不互相影响；
- dispose 不影响其他租户/用户；
- recreate 不残留旧 provider state；
- provider 能在 unpublished setup transaction 内正确挂载。

## Context Identity 不是 Authorization

`runtimeIdentityOf(ctx)`、`tenantIdOf(ctx)`、`principalOf(ctx)` 只是可信同进程的 composition metadata，**不是持久授权结果**。Session / durable boundary 仍然必须使用 `ctx.multiTenant`。

## Explicit boundaries

这个 package 不是 hostile-code / process sandbox。Cordis Context 不隔离 process global、filesystem、shell、network、environment variable，也挡不住故意访问 `ctx.root` 的同进程插件。

要求 strong isolation 的部署继续交给独立 process / container / Pod。

v0.2 同样不声称所有 DSH provider 自动 tenant-safe。已知例子是 DSH MCP client 的 root-scoped `serverName` reservation；这类问题应该通过 upstream/provider seam 解决，而不是再造一套隐藏问题的 service registry。

Auth 产品、HTTP/WebSocket binding、billing、organization UI、production MCP SaaS integration 等产品级能力属于后续 SaaS Framework / Plugin Family，不属于这个 Runtime Primitive。

## 安装

Prerelease 使用 `next` dist-tag：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

Bundle 加载三条 deployment-global service：

- `ctx.tenantSessionStore` —— 内存参考 ownership provider；
- `ctx.multiTenant` —— 持久 ownership / authorization kernel；
- `ctx.tenantRuntime` —— canonical Tenant / Principal runtime manager。

## 发布验证

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

Release gate 覆盖 package invariant、typecheck、unit / contract tests、packed external-consumer smoke、session/admission probes，以及 DSH Agent owner-context proof。

## License

MIT
