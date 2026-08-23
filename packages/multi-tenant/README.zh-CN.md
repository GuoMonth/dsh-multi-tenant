[English](./README.md) | 简体中文

# dsh-multi-tenant

面向 DeepSeek Harness（DSH）的 Context-native Multi-Tenant Runtime 原语。

> 当前 package：`0.2.0-rc.3`，发布到 npm `latest`。
>
> 当前 DSH compatibility baseline：`0.1.1-rc.2`，release commit 为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。Baseline 显式固定，由我们手动推进。

## Runtime Model

v0.2 把 tenancy 建模成一棵 canonical ownership tree，并统一生命周期语义：

```text
Deployment / Root
│
├── shared ownership kernel
├── shared TenantRuntimeService
│
├── Tenant(acme)
│   ├── tenant capability graph
│   ├── Principal(alice)
│   │   └── principal capability graph
│   └── Principal(bob)
│
└── Tenant(globex)
```

Tenant / Principal capability authority 使用 Cordis service isolation；DSH Agent / Preset registration visibility 保持独立的 `@deepseek-ai/dsh-scope` plane。

## Supported guarantee

v0.2 保留两层互相独立的 enforcement：

1. **Context-native capability isolation** —— canonical Tenant / Principal node 拥有真实 Cordis child lifecycle 与显式 isolation label；
2. **Persistent ownership authorization** —— v0.1 `ctx.multiTenant` Kernel 保持 deployment-global，对 `(tenantId, userId)` session ownership 做不可变、fail-closed 授权。

Runtime Contract 进一步保证：

- 每个 tenantId 一个 canonical active Tenant；
- 每个 Tenant 内每个 userId 一个 canonical active Principal；
- Tenant / Principal 共用 `ensure / get / state / dispose` 语义；
- preparing node 永远不可见；
- 同 key 并发 `ensure()` single-flight；
- setup 在 publication 前运行，并可返回同步 `commit()`；
- setup 失败完整 rollback；
- preparing transaction 是可取消的 first-class lifecycle resource；
- registry shutdown 先 close admission、cancel preparing，再 drain published scope；
- active definition drift 明确失败；
- Tenant teardown 拥有 Principal teardown；
- ownership/security 与 Cordis core service 不可被隔离掉。

## Canonical Publication

```ts
const acme = await ctx.tenantRuntime.tenants.ensure('acme', {
  isolateServices: ['tenantAuth', 'tenantMcp'],
  setup: async ({ ctx: tenantCtx, identity, signal }) => {
    await tenantCtx.plugin(authProvider, acmeAuthConfig)
    await tenantCtx.plugin(mcpProvider, acmeMcpConfig)

    return {
      commit() {
        // 可选：只在精确 publication boundary 执行的最终提交。
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

Principal registry 结构上嵌套在 Tenant 下，所以 Principal creation 只接受 `userId`；`tenantId` 由父节点决定，错误 tenantId 从数据结构层面不可表达。

`ensure(key)` 不带 definition 时只表示“加入已有 canonical node”；消费层不需要知道创建配方。只有显式再次提供 definition 的调用方才参与 definition-drift 校验。

## Agent Composition Boundary

Canonical Principal Context 是 capability root，不是绕过 Cordis dependency injection 的万能 Context。Agent orchestration 应在 Principal 派生的 integration fiber 中显式 inject `agents`：

```ts
const alice = await acme.principals.ensure('alice')

const operation = alice.ctx.inject(['agents'], async (ownerCtx) => {
  return ownerCtx.agents.create({
    sessionId,
    setup(agentCtx) {
      const tenantMcp = ownerCtx.get('tenantMcp')
      // 把需要的 DSH tools / prompt / listeners 组合到 agentCtx。
    },
  })
})

await operation
```

DSH 会把这个 caller-bound Context 作为 `ownerCtx` 传给 Agent factory。CI 直接执行真实 public AgentRegistry package，证明 Principal identity 与 A/B capability separation 在这个边界保持正确。

## Tenant-Safe Provider Contract

`dsh-multi-tenant/testing` 提供可执行 Provider conformance harness：

```ts
await assertRuntimeCapabilityProviderContract({
  serviceName: 'myCapability',
  level: 'tenant', // 或 principal
  mount: async (ctx, marker) => { /* mount provider */ },
  fingerprint: async ctx => { /* 识别 resolved instance */ },
})
```

Harness 会验证同名 A/B isolation、root/parent 不泄漏、descendant inheritance、sibling 不干扰、dispose isolation、clean recreation、以及 unpublished setup ownership。

## Context Identity 不是 Authorization

`runtimeIdentityOf(ctx)`、`tenantIdOf(ctx)`、`principalOf(ctx)` 是可信同进程 composition metadata，**不是持久授权结果**。Session / durable boundary 仍然必须使用 `ctx.multiTenant`。

## Explicit boundaries

这个 package 不是 hostile-code / process sandbox。Cordis Context 不隔离 process global、filesystem、shell、network、environment variable，也挡不住故意访问 `ctx.root` 的同进程插件。

Strong isolation 属于独立 process / container / Pod deployment boundary。

本 package 同样不声称现有所有 DSH provider 自动 tenant-safe；provider compatibility 必须通过 contract 验证。产品级 Auth、HTTP/WebSocket binding、billing、organization UI、production MCP SaaS composition 属于后续 SaaS Framework / Plugin Family。

## 安装

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

当前只维护一个 npm channel：`latest` 就是我们明确发布的最新版本。

Bundle 加载三条 deployment-global service：

- `ctx.tenantSessionStore` —— 内存参考 ownership provider；
- `ctx.multiTenant` —— 持久 ownership / authorization kernel；
- `ctx.tenantRuntime` —— canonical Tenant / Principal runtime manager。

## 发布验证

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

CI 还会 checkout 精确的上游 DSH release commit 验证 version，并对精确 npm 包运行 executable compatibility probes。

## License

MIT
