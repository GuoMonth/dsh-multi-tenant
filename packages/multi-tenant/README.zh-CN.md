[English](./README.md) | 简体中文

# dsh-multi-tenant

面向 DeepSeek Harness（DSH）的 Context-native Multi-Tenant Runtime 与 v0.3 SaaS Framework Core 原语。

> 已发布 package line：`0.2.0-rc.3`，npm `latest`；仓库当前在这套 Runtime Contract 上推进 v0.3 Core。
>
> pinned DSH compatibility baseline：`0.1.1-rc.2`，release commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。

## Runtime model

```text
Deployment / Root
│
├── shared TenantSessionStore
├── shared MultiTenantService
├── shared TenantRuntimeService
│
├── Tenant(acme)
│   ├── tenant capabilities
│   ├── Principal(alice)
│   │   ├── principal capabilities
│   │   └── Operation
│   │       ├── operation capabilities
│   │       └── one-shot snapshot -> DSH Agent
│   └── Principal(bob)
│
└── Tenant(globex)
```

Tenant / Principal / Operation capability authority 使用原生 Cordis Context / Fiber ownership；DSH Agent / Preset registration visibility 保持独立的原生 `@deepseek-ai/dsh-scope` plane。

## Supported guarantee

Package 现在组合三层 contract：

1. **Persistent ownership authorization** —— v0.1 claim-once `(tenantId, userId) -> session` invariant，fail closed；
2. **Canonical Multi-Tenant Runtime** —— v0.2 Tenant / Principal identity、unpublished setup、isolation、quiescent teardown；
3. **SaaS Core composition / operation semantics** —— v0.3 deterministic capability planning 与 Principal-owned one-shot work。

当前保证：

- 每个 tenantId 一个 canonical active Tenant；
- 每个 Tenant 内每个 userId 一个 canonical active Principal；
- unpublished setup + 显式 publication boundary；
- 并发 `ensure()` single-flight；
- setup 失败完整 rollback；
- Tenant teardown 拥有 Principal teardown；
- Principal teardown 会关闭 Operation admission 并 drain Operation；
- capability scope 对应真实 Cordis ownership boundary；
- 非法 SaaS graph 在 Runtime bootstrap 前失败；
- equivalent Plan deterministic normalize；
- structurally different Plan 不能悄悄共用 active canonical node；
- 一次用户动作只执行一次，即使捕获的 provider 后续发生 churn；
- DSH Agent create / resume 获得正确 caller-bound Operation / Principal `ownerCtx`；
- 重复 Operation cancel / dispose 幂等且 quiescent。

## Canonical publication

v0.2 low-level Runtime Contract 仍然可以直接使用：

```ts
const acme = await ctx.tenantRuntime.tenants.ensure('acme', {
  isolateServices: ['tenantAuth'],
  definitionKey: 'tenant-auth:v1',
  setup: async ({ ctx: tenantCtx }) => {
    await tenantCtx.plugin(authProvider)
  },
})

const alice = await acme.principals.ensure('alice', {
  isolateServices: ['userCredentials'],
  definitionKey: 'credentials:v1',
  setup: async ({ ctx: principalCtx }) => {
    await principalCtx.plugin(credentialsProvider)
  },
})
```

Consumer 可以只调用 `ensure(key)` 加入已存在 canonical node，不需要知道 creation recipe。知道配方的 caller 可以携带 `definitionKey`；不同 key / isolation definition 会抛 `RuntimeDefinitionConflictError`。

v0.3 Composition layer 会根据 deterministic Plan fingerprint 自动生成 canonical definition identity。

## SaaS Composition

`dsh-multi-tenant/composition` 把 mutable product intent 与 executable Runtime structure 分开：

```ts
const plan = compileSaaSDefinition({
  capabilities: [
    { key: 'agents', scope: 'deployment', required: true },
    { key: 'tenantMcp', scope: 'tenant', required: true },
    { key: 'credentials', scope: 'principal', required: true },
  ],
  providers: [
    { id: 'dsh-agents', capability: 'agents', scope: 'deployment' },
    {
      id: 'tenant-mcp',
      capability: 'tenantMcp',
      scope: 'tenant',
      setup({ ctx }) {
        ctx.provide('tenantMcp', makeTenantMcp())
      },
    },
    {
      id: 'credentials',
      capability: 'credentials',
      scope: 'principal',
      requires: ['tenantMcp'],
      setup({ ctx }) {
        ctx.provide('credentials', loadCredentials())
      },
    },
  ],
})
```

Compiler 负责 provider selection、dependency visibility、cycle、scope placement 与 deterministic bootstrap order。非 deployment provider 必须真的在声明的 scope materialize；ambient provider 只允许 deployment scope。

Plan 可以直接生成 Runtime definition：

```ts
const deployment = await bootstrapDeploymentComposition(ctx, plan)
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinitionFromPlan(plan))
const alice = await tenant.principals.ensure('alice', principalDefinitionFromPlan(plan))
```

## One-shot Operation boundary

**不要**把一次用户 request 写成 raw `principal.ctx.inject(...)` callback。Cordis injection 是 reactive primitive，required service 消失再恢复时 callback 可能重新执行。

使用 Principal-owned Operation registry：

```ts
const operation = alice.operations.start({
  ...operationDefinitionFromPlan(plan),
  requires: ['agents', 'tenantMcp', 'credentials'],
  async execute({ capabilities, signal }) {
    const agents = capabilities.require<any>('agents')
    const credentials = capabilities.require('credentials')

    return agents.create({
      sessionId,
      signal,
      setup(agentCtx) {
        // 在这里组合 DSH-native Agent / Preset scoped tool/prompt/listener。
      },
    })
  },
})

const handle = await operation.result
```

Operation 会创建普通 Principal-owned child Fiber，prepare operation-local provider，一次性解析全部 required Cordis capability 为 immutable snapshot，然后只调用一次 `execute()`。Provider churn 永远不会造成 semantic re-entry。

捕获到的仍然是真实 Cordis value / traceable service；Snapshot 不是第二套 service registry。

## DSH Agent boundary

CI 直接执行 pinned baseline 上真实 public `@deepseek-ai/dsh-agent` AgentRegistry。Vertical proof 覆盖并发 multi-Tenant create、resume 与 downstream create failure，并验证 DSH factory 看到正确 Tenant / Principal / Operation caller context。

Operation 不复制 Cordis 私有 isolation map 到 `Agent.ctx`，不创建 Agent tenant registry，也不替换 DSH Agent / Preset scope 语义。

## Tenant-safe provider contract

`dsh-multi-tenant/testing` 导出 executable provider conformance：

```ts
await assertRuntimeCapabilityProviderContract({
  serviceName: 'myCapability',
  level: 'tenant', // 或 principal
  mount: async (ctx, marker) => { /* mount provider */ },
  fingerprint: async ctx => { /* identify resolved instance */ },
})
```

Harness 验证同名 A/B isolation、parent/root 不泄漏、descendant inheritance、sibling 不干扰、teardown isolation、recreation、unpublished setup ownership。

## Package boundary

M3 gate 的结论是继续一个 package。`runtime`、`operation`、`composition`、`testing` 当前属于同一套 ownership / lifecycle contract，因此作为 `dsh-multi-tenant` public subpath 暴露。

只有后续 Auth / Credentials / MCP contract 真正证明独立 consumer / replacement / lifecycle / release / Distribution boundary 时，才应该出现新的 SaaS package。

## Context identity 不是 Authorization

`runtimeIdentityOf(ctx)`、`tenantIdOf(ctx)`、`principalOf(ctx)` 是 trusted same-process composition metadata，**不是 durable authorization decision**。Session / durable boundary 仍然使用 `ctx.multiTenant`。

## Explicit boundaries

这个 package 不是 hostile-code / process sandbox。Cordis Context 不隔离 process memory、filesystem、shell、network、environment variable 或恶意同进程插件。

Strong isolation 属于 process/container/Pod deployment boundary。

Package 也不声称任意 DSH / provider implementation 自动 tenant-safe；Provider compatibility 必须证明。Production Auth、credentials/secrets、MCP ecosystem integration、audit/usage、Distribution polish 都是后续 v0.3/v0.4 工作。

## 安装

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

Bundle 会安装 deployment-global ownership kernel 与 TenantRuntimeService；Composition / Operation 是建立在 Runtime Contract 上的 programmatic public API。

## Public subpaths

```text
dsh-multi-tenant
dsh-multi-tenant/runtime
dsh-multi-tenant/operation
dsh-multi-tenant/composition
dsh-multi-tenant/store
dsh-multi-tenant/testing
```

## Release verification

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

CI 验证精确 upstream DSH identity、Cordis lifecycle assumption、Node 22.19/24 的 SaaS Core vertical path，并把 packed tarball 安装到 clean external consumer 再执行一次。

## License

MIT
