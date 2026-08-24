[English](./README.md) | 简体中文

# dsh-multi-tenant

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）真正成为 **Multi-Tenant Runtime**，并在不替换底层 DSH/Cordis 架构的前提下成长为可组合的 **SaaS Framework Core**。

> **已发布基础：** `dsh-multi-tenant@0.2.0-rc.3` —— canonical Tenant/Principal Runtime Contract + 冻结的 ownership kernel。
>
> **当前主开发线：** **v0.3 SaaS Framework Core**。M1–M3 已建立 typed composition、Principal-owned one-shot Operation 与真实 DSH Agent create/resume/failure evidence；当前 hardening pass 正在清掉过粗 composition identity，之后再进入产品 capability 阶段。
>
> **当前 DSH compatibility baseline：** `0.1.1-rc.2`，上游 release commit 为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。CI 永远不追 floating `latest` / `master`。

## 版本方向

```text
v0.1  Security Kernel
  ↓
v0.2  Multi-Tenant Runtime Contract       已发布
  ↓
v0.3  SaaS Framework Core                当前开发
  ↓
v0.4  Production Provider Ecosystem      预告
```

v0.1 回答 **“谁拥有 Session”**；v0.2 回答 **“Tenant / Principal 在 Runtime 中是什么”**；v0.3 回答 **“一个 SaaS 产品如何进入、组合并执行这套 Runtime，同时不把产品身份、Runtime capability 与 Agent integration 压成同一种机制”**。

## v0.3 North Star

```text
Product / Transport
      ↓ 产品自己完成 authentication
Trusted Subject
      ↓ identity resolution
Product Ingress Boundary
      ↓
TenantPrincipal
      ↓
canonical Tenant / Principal
      ↓
Typed Runtime Capabilities
      ↓
Principal-owned one-shot Operation
      ↓ immutable capability snapshot
Agent Integration
      ↓ DSH-native Agent setup / plugin composition
DeepSeek Harness
```

这里最重要的是：这些是**不同语义 plane**。

- Product ingress 决定哪个可信 `TenantPrincipal` 进入 Runtime；
- Runtime capability 存在于 Deployment / Tenant / Principal / Operation ownership 中；
- Operation 为一次 semantic action 捕获 immutable capability snapshot；
- Agent integration 把可信 Runtime view 转换成 DSH-native Agent/Preset/plugin composition。

参见 [`docs/specs/saas-boundaries.zh-CN.md`](./docs/specs/saas-boundaries.zh-CN.md)。

## 当前 Runtime 结构

```text
Deployment / Root
│
├── shared TenantSessionStore          persistent ownership storage
├── shared MultiTenantService         fail-closed authorization kernel
├── shared TenantRuntimeService
│
├── Tenant(acme)                      canonical capability node
│   ├── tenant capabilities
│   ├── Principal(alice)              canonical capability node
│   │   ├── principal capabilities
│   │   └── Operation                 ephemeral, one-shot
│   │       ├── operation capabilities
│   │       └── typed immutable snapshot -> DSH Agent integration
│   └── Principal(bob)
│
└── Tenant(globex)
```

Persistent authorization、Runtime capability ownership、DSH Agent/Preset registration 与 strong process/container isolation 继续保持独立。

## Typed Capability

v0.3 不再用彼此独立的 string + scope 表示 capability identity。

```ts
import { defineCapability, provideCapability } from 'dsh-multi-tenant'

const tenantMcpConfig = defineCapability<TenantMcpConfig, 'tenant'>(
  'tenantMcpConfig',
  'tenant',
)
const credentials = defineCapability<Credentials, 'principal'>(
  'credentials',
  'principal',
)
```

`CapabilityToken<T, Scope>` 把：

```text
stable key + value type + lifecycle/authority scope
```

绑定成一个 semantic identity。

它只是 Cordis service key 之上的 typed 层；Cordis 仍然负责 service resolution / lifecycle，不存在第二套 DI container。

## Composition Compiler

`dsh-multi-tenant/composition` 把 mutable intent 与 executable structure 分开：

```ts
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
        provideCapability(ctx, credentials, loadPrincipalCredentials())
      },
    },
  ],
})
```

Compiler 在 traffic 前 resolve provider selection、dependency visibility、cycle 与 bootstrap order。

### Composition Locality

一个 Plan 现在拥有两级 identity：

```text
plan.fingerprint
  exact whole-plan identity / diagnostics

plan.scopeFingerprints
  Deployment / Tenant / Principal / Operation dependency-closure identity
```

Canonical Tenant / Principal 使用自己的 scope-local fingerprint。因此只修改 Operation provider，不再错误地让无关 Tenant / Principal 发生 conflict；但如果真正参与 Tenant creation 的 provider 或其 ancestor dependency 改变，仍然会明确抛出 `RuntimeDefinitionConflictError`。

这不等于 hot reconfiguration：v0.3 依然不原地修改 active canonical node 的 creation recipe。

## One-shot Operation

Cordis `ctx.inject()` 是 reactive primitive，dependency 消失后恢复时 callback 可以重新执行。这是正确的 plugin lifecycle，但不是一次用户 transaction。

所以 v0.3 使用 Principal-owned non-reactive Operation：

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinitionFromPlan(plan))
const alice = await tenant.principals.ensure('alice', principalDefinitionFromPlan(plan))

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
        // DSH-native Agent / Preset / plugin composition 在这里发生。
      },
    })
  },
})

const handle = await operation.result
```

Snapshot 的返回类型由 token 决定。Required capability 只在 `execute()` 前捕获一次，provider churn 不会让 semantic work re-entry。

## 下一阶段真正要证明什么

下一阶段不再描述成三个并列的“Auth / Credentials / MCP Provider”。MR-A 已经证明它们处在不同边界。

### M4 —— Product Ingress + Principal Capability Contract

- **Trusted identity resolution**：authenticated product subject -> `TenantPrincipal` -> canonical Runtime topology；
- **Credentials**：第一个真实 Principal-owned typed Runtime capability；
- 验证 replacement / lifecycle / isolation，不把 JWT/OAuth 厂商逻辑塞进 Core。

### M5 —— Agent Integration Reference Path

- 消费 Tenant config + Principal credentials + Operation snapshot；
- 转换成 DSH-native Agent setup；
- 使用官方 `@deepseek-ai/dsh-mcp-client` 作为第一个 MCP **Tools** reference integration；
- 不重新造 MCP protocol stack，也不为 pinned Harness 当前没有 consumer 的 Resources / Prompts 写 compatibility bridge。

先跑通一条真实 Product Ingress -> Principal -> Capability -> Operation -> Agent Integration -> DSH 路径，再进入 diagnostics/hardening。

## Package Boundary

**继续一个 package。** 本次 hardening 不创建 `dsh-saas`、Auth package 或 MCP package。

只有真实实现证明了独立 consumer API、replacement/lifecycle boundary、release cadence 或 Distribution boundary，新 package 才出现。

## v0.3 Roadmap 一览

```text
M0    Spec / Assumption Foundation                         ✅
M1    Composition Compiler                                 ✅
M2    Principal Operation Kernel + A6                      ✅
M3    Multi-tenant real-DSH Core Vertical Slice            ✅
M3.5  Post-MR-A architecture hardening                     ← 当前
      typed capability + scope-local composition identity
M4    Product Ingress + Principal Capability contracts
M5    Agent Integration reference path + minimal defaults
M6    Diagnostics / explainability
M7    Conformance + compatibility hardening
M8    v0.3 release convergence
```

完整 release definition 见 [ROADMAP.zh-CN.md](./ROADMAP.zh-CN.md)。

## 工程方法

```text
Spec
  → Assumption Ledger
  → executable external probe / contract test
  → strong types + state model
  → failing behavior test
  → smallest implementation
  → vertical-slice CI proof
```

真正重要的规则：

- **Structure before patches** —— 通过重构 ownership / data / state，让 feature 自然生长；
- **Strong semantic types** —— 让非法 topology 尽量无法表达；
- **Assumption-first verification** —— DSH / Cordis 行为必须有 executable evidence；
- **相关性优先于“正确性展示”** —— 技术上正确但已经不服务 architecture 的 live surface 直接删除；
- **控制得住 -> enforce；生态协作 -> standardize；控制不住 -> explicit boundary；**
- **不再造第二套 DI** —— Cordis 继续承担 service / lifecycle substrate；
- **不预判 package topology** —— package boundary 必须由证据挣出来；
- **Prerelease freedom** —— 早期 API 阻碍长期正确模型时，不为兼容背债。

## Compatibility Evidence

GitHub Actions 当前在 Node 22.19 / Node 24 上验证：

- 精确 upstream DSH release identity；
- DSH Session setup / publication / rollback；
- caller-bound DSH Agent owner context；
- Cordis parent / child teardown 与 reactive injection；
- Runtime capability provider isolation；
- typed SaaSDefinition -> CompositionPlan -> Tenant/Principal -> Operation -> 真实 DSH create/resume/failure；
- packed external consumer 的 typed snapshot 与 composition-locality 行为。

Machine-readable ledger 在 [`docs/specs/v0.3-assumptions.json`](./docs/specs/v0.3-assumptions.json)，当前 `A1`–`A6` 全部 proven。

## Explicit Security Boundary

Cordis Context 是 trusted same-process composition / lifecycle boundary，不是 hostile-code sandbox。它不隔离 process memory、filesystem、shell、network、environment variable 或恶意同进程插件。

Strong isolation 属于 process/container/Pod deployment profile。

## v0.4 预告

v0.4 预计把 v0.3 Framework Core 扩展为更完整的 **Production Provider Ecosystem & Productization**：production identity integration、durable secrets / credentials、更丰富 MCP integration、operational provider、durable store / migration、更强 deployment profile 与更完善 Distribution / 安装体验。

详细 v0.4 Roadmap 会根据 v0.3 的真实 architecture 与使用证据再规划。

## 安装

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

Marketplace / custom installer 不在当前 critical path。npm + DSH-native bundle path 就是当前支持的 baseline。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

## License

MIT
