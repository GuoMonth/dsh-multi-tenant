[English](./README.md) | 简体中文

# dsh-multi-tenant

面向 DeepSeek Harness（DSH）的 Context-native Multi-Tenant Runtime 与 v0.3 SaaS Framework Core 原语。

> 已发布 package line：`0.2.0-rc.3`，npm `latest`；仓库当前在这套 Runtime Contract 上推进 v0.3 Core。
>
> pinned DSH compatibility baseline：`0.1.1-rc.2`，release commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。

## Runtime Model

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
│   │       └── typed one-shot snapshot -> Agent integration -> DSH
│   └── Principal(bob)
│
└── Tenant(globex)
```

Tenant / Principal / Operation capability authority 使用原生 Cordis Context / Fiber ownership；DSH Agent / Preset registration visibility 继续保持独立的 `@deepseek-ai/dsh-scope` plane。

## Supported Guarantee

Package 当前组合三层 contract：

1. **Persistent ownership authorization** —— v0.1 claim-once `(tenantId, userId) -> session` invariant，fail closed；
2. **Canonical Multi-Tenant Runtime** —— v0.2 Tenant / Principal identity、unpublished setup、isolation、quiescent teardown；
3. **SaaS Core composition / operation semantics** —— v0.3 typed capability planning 与 Principal-owned one-shot work。

当前保证：

- 每个 tenantId 一个 canonical active Tenant；
- 每个 Tenant 内每个 userId 一个 canonical active Principal；
- unpublished setup + 显式 publication boundary；
- 并发 `ensure()` single-flight；
- setup 失败完整 rollback；
- Tenant teardown 拥有 Principal teardown；
- Principal teardown 关闭 Operation admission 并 drain Operation；
- capability scope 对应真实 Cordis ownership boundary；
- 非法 SaaS graph 在 Runtime bootstrap 前失败；
- equivalent Plan deterministic normalize；
- 真实 local creation drift 明确失败；
- 无关 descendant Plan change 不制造 false parent Runtime conflict；
- 一次用户动作只执行一次，即使捕获的 provider 后续发生 churn；
- DSH Agent create / resume 获得正确 caller-bound Operation / Principal `ownerCtx`；
- 重复 Operation cancel / dispose 幂等且 quiescent。

## Typed CapabilityToken

Capability identity 使用一个 semantic token 表示：

```ts
import {
  defineCapability,
  provideCapability,
} from 'dsh-multi-tenant'

const credentials = defineCapability<Credentials, 'principal'>(
  'credentials',
  'principal',
)
```

Token 绑定：

```text
stable Cordis service key
+ semantic value type
+ lifecycle / authority scope
```

`provideCapability()` / `getCapability()` 只是 Cordis 上的 typed facade，不创建 storage / resolver / 第二套 DI container。

## Low-level Canonical Runtime

v0.2 contract 仍可直接使用：

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

Consumer 可以只调用 `ensure(key)` 加入已有 canonical node，不需要知道 creation recipe。显式提供不同 semantic definition 的 caller 会得到 `RuntimeDefinitionConflictError`。

## SaaS Composition

`dsh-multi-tenant/composition` 把 mutable intent 与 executable Runtime structure 分开：

```ts
const tenantMcpConfig = defineCapability<TenantMcpConfig, 'tenant'>(
  'tenantMcpConfig',
  'tenant',
)

const plan = compileSaaSDefinition({
  capabilities: [
    { capability: agents, required: true },
    { capability: tenantMcpConfig, required: true },
    { capability: credentials, required: true },
  ],
  providers: [
    { id: 'dsh-agents', capability: agents },
    {
      id: 'tenant-mcp-config',
      capability: tenantMcpConfig,
      setup({ ctx }) {
        provideCapability(ctx, tenantMcpConfig, loadTenantMcpConfig())
      },
    },
    {
      id: 'credentials',
      capability: credentials,
      requires: [tenantMcpConfig],
      setup({ ctx }) {
        provideCapability(ctx, credentials, loadCredentials())
      },
    },
  ],
})
```

Compiler 在 traffic 前 resolve provider selection、dependency visibility、cycle 与 deterministic bootstrap order。Ambient provider 只能是 deployment；非 deployment provider 必须真的在声明 Cordis scope 内拥有 capability。

### Whole Plan vs Local Canonical Identity

```text
plan.fingerprint
  exact whole-plan structural identity

plan.scopeFingerprints.tenant
plan.scopeFingerprints.principal
plan.scopeFingerprints.operation
  该 scope 的 provider dependency-closure identity
```

Canonical Tenant / Principal definition 使用 scope-local fingerprint。只修改 Operation provider，不再错误 invalidate 无关 Tenant / Principal；如果真正参与 Tenant creation 的 provider 改变，仍然会产生 conflict。

Plan 生成 Runtime definition：

```ts
const deployment = await bootstrapDeploymentComposition(ctx, plan)
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinitionFromPlan(plan))
const alice = await tenant.principals.ensure('alice', principalDefinitionFromPlan(plan))
```

## One-shot Operation Boundary

**不要**把一次用户 request 写成 raw `principal.ctx.inject(...)` callback。Cordis injection 是 reactive primitive，required service 消失再恢复时 callback 可能重新执行。

使用 Principal-owned Operation registry：

```ts
const operation = alice.operations.start({
  ...operationDefinitionFromPlan(plan),
  requires: [agents, credentials],
  async execute({ capabilities, signal }) {
    const dshAgents = capabilities.require(agents)
    const credential = capabilities.require(credentials)

    return dshAgents.create({
      sessionId,
      signal,
      setup(agentCtx) {
        // 在这里组合 DSH-native Agent / Preset scoped behavior。
      },
    })
  },
})

const handle = await operation.result
```

Snapshot 返回类型由 token 决定。Operation 会创建 Principal-owned child Fiber，prepare Operation-local provider，一次性 capture required Cordis value，再只执行一次 `execute()`；provider churn 永远不会造成 semantic re-entry。

## Framework Boundary Planes

Product identity ingress 与 Agent integration 不会被压成 Runtime Provider graph 的一部分：

```text
Product authentication
  -> trusted identity resolution
  -> TenantPrincipal
  -> canonical Runtime
  -> typed capabilities
  -> Operation
  -> Agent integration
  -> DSH
```

v0.3 下一阶段用 Credentials 验证第一个真实 Principal capability；用 MCP Tools 验证 DSH-native Agent Integration，而不是重造 MCP stack。

详细设计见仓库 `docs/specs/saas-boundaries.zh-CN.md`。

## DSH Agent Boundary

CI 直接执行 pinned baseline 上真实 public `@deepseek-ai/dsh-agent` AgentRegistry。Vertical proof 覆盖并发 multi-Tenant create、resume、downstream create failure，并验证 DSH factory 看到正确 Tenant / Principal / Operation caller context。

Operation 不复制 Cordis 私有 isolation map 到 `Agent.ctx`，不创建 Agent tenant registry，也不替换 DSH Agent / Preset scope 语义。

## Tenant-safe Provider Contract

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

## Package Boundary

当前 gate 继续保持一个 package。`runtime`、`operation`、`composition`、`testing` 仍然是一套 ownership / lifecycle contract，因此作为 `dsh-multi-tenant` public subpath 暴露。

只有后续真实实现证明了独立 consumer / replacement / lifecycle / release / Distribution boundary，才应该出现新的 SaaS/Auth/MCP package。

## Context Identity 不是 Authorization

`runtimeIdentityOf(ctx)`、`tenantIdOf(ctx)`、`principalOf(ctx)` 是 trusted same-process composition metadata，**不是 durable authorization decision**。Session / durable boundary 仍然使用 `ctx.multiTenant`。

## Explicit Boundaries

这个 package 不是 hostile-code / process sandbox。Cordis Context 不隔离 process memory、filesystem、shell、network、environment variable 或恶意同进程 plugin。

Strong isolation 属于 process/container/Pod deployment boundary。

## 安装

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

Bundle 安装 deployment-global ownership kernel 与 TenantRuntimeService；Typed Composition / Operation 是建立在 Runtime Contract 上的 programmatic public API。

## Public Subpaths

```text
dsh-multi-tenant
dsh-multi-tenant/runtime
dsh-multi-tenant/operation
dsh-multi-tenant/composition
dsh-multi-tenant/store
dsh-multi-tenant/testing
```

## Release Verification

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

CI 验证精确 upstream DSH identity、Cordis lifecycle assumption、typed/local Composition、Node 22.19/24 的 SaaS Core vertical path，以及 clean external consumer 中的 packed tarball。

## License

MIT
