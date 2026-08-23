[English](./README.md) | 简体中文

# dsh-multi-tenant

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）真正成为 **Multi-Tenant Runtime**，并在不替换底层 DSH/Cordis 架构的前提下成长为可组合的 **SaaS Framework Core**。

> **已发布基础：** `dsh-multi-tenant@0.2.0-rc.3` —— canonical Tenant/Principal Runtime Contract + 冻结的 ownership kernel。
>
> **当前主开发线：** **v0.3 SaaS Framework Core**。M1–M3 Core Vertical Slice 已实现：deterministic CompositionPlan、Principal-owned one-shot Operation，以及真实 DSH Agent create/resume/failure evidence。
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

v0.1 回答 **“谁拥有这个 Session”**；v0.2 回答 **“Tenant / Principal 在 Runtime 里是什么”**；v0.3 回答 **“SaaS 产品如何通过这套 Runtime 声明、验证并执行可替换 capability”**。

## v0.3 North Star

```text
SaaSDefinition
      ↓ compile / validate
immutable CompositionPlan
      ↓ materialize
canonical Tenant / Principal
      ↓
Principal-owned one-shot Operation
      ↓ capability snapshot
DSH Agent create / resume / drive
      ↓
deterministic teardown
```

M1–M3 已经建立的核心 guarantee：

- 非法 composition 在 Runtime traffic 进入前失败；
- 等价 definition deterministic normalize；
- structurally different Plan 不能悄悄共用同一个 active canonical Tenant / Principal；
- Tenant / Principal / Operation scope 必须对应真实 Cordis ownership boundary；
- Tenant / Principal capability state 保持隔离；
- 一次用户可见动作对应一个 non-reactive semantic Operation；
- provider churn 不会 re-enter 或重复 Operation work；
- Principal teardown 会关闭 admission 并 drain 自己的 Operation；
- DSH create / resume 获得正确的 Operation/Principal-derived `ownerCtx`；
- DSH / provider failure 保留 causal error，同时 Operation cleanup 仍然完整完成；
- packed npm artifact 与源码 CI 执行的是同一套 Composition / Operation contract。

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
│   │       └── immutable snapshot -> DSH Agent
│   └── Principal(bob)
│
└── Tenant(globex)
```

项目保持四个 plane 相互独立：

1. **Persistent authorization** —— durable `(tenantId, userId) -> session` ownership，始终 fail closed；
2. **Tenant / Principal / Operation capability ownership** —— 原生 Cordis Context / Fiber lifecycle 与 service isolation；
3. **Agent / Preset registration graph** —— 原生 DSH `@deepseek-ai/dsh-scope`，承载 Agent-local tool / prompt / listener；
4. **Strong deployment isolation** —— same-process trust 不够时使用 process/container/Pod boundary。

SaaS 层只组合这些 plane，不把 Cordis 私有状态复制到 Agent scope，也不创建第二套 DI Container。

## Composition Compiler

`dsh-multi-tenant/composition` 把 mutable intent 与 executable structure 分开：

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
        ctx.provide('tenantMcp', createTenantMcp())
      },
    },
    {
      id: 'credentials',
      capability: 'credentials',
      scope: 'principal',
      requires: ['tenantMcp'],
      setup({ ctx }) {
        ctx.provide('credentials', loadPrincipalCredentials())
      },
    },
  ],
})
```

Compiler 负责 resolve selection、dependency visibility、cycle、scope placement 与 bootstrap order。Deterministic Plan fingerprint 会进入 canonical Runtime definition identity，因此不同 composition 不能悄悄 join 同一个 active node。

Ambient provider 只允许 deployment scope；Tenant / Principal / Operation provider 必须真的在自己声明的 scope materialize。

## One-shot Operation

Cordis `ctx.inject()` 是 reactive primitive：dependency 消失再恢复时 callback 可以重新执行。这是正确的 plugin lifecycle，但不能直接定义一次用户 transaction。

所以 v0.3 使用 Principal-owned non-reactive Operation：

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinitionFromPlan(plan))
const alice = await tenant.principals.ensure('alice', principalDefinitionFromPlan(plan))

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
        // 在这里组合 DSH-native Agent / Preset scope。
      },
    })
  },
})

const handle = await operation.result
```

Operation setup 会在自己的 Context 上一次性解析 required capability，冻结成 immutable snapshot，然后只调用一次 `execute()`。Provider churn 可能让已经捕获的 provider 后续不可用，但绝不会让 semantic work 自动重跑。这就是 `A6`，已经在 Node 22.19 / Node 24 上通过 pinned public DSH AgentRegistry 证明。

## Provider Ecosystem 下一阶段

`dsh-multi-tenant/testing` 已经提供 Tenant / Principal capability isolation 的 executable conformance。M4/M5 接下来只做能够证明 SaaS ecosystem model 的最小真实 contract，优先：

- Authenticated Identity Boundary；
- Credentials capability；
- MCP capability；
- minimal replaceable reference providers。

这些是 capability responsibility，不是提前批准好的 package name。

### M3 Package Boundary Gate 结论

**现在不创建 `dsh-saas` package。** Composition + Operation 仍然是在扩展同一套 Runtime ownership contract，还不足以证明独立 versioning / distribution boundary。

只有 M4/M5 真的形成独立 consumer API、replacement/lifecycle boundary、release boundary 或 Distribution boundary，新 package 才应该自然出现。当前保持一个 package，更轻、更自由、噪音更少。

## v0.3 Roadmap 一览

```text
M0  P0 Spec / Assumption Foundation          ✅
M1  Composition Compiler                     ✅
M2  Operation Kernel + A6                    ✅
M3  Multi-tenant DSH vertical slice          ✅
    └─ package boundary: 继续一个 package
M4  最小 Auth / Credentials / MCP contracts   ← next
M5  最小 reference providers
M6  Diagnostics / explainability
M7  Conformance + compatibility hardening
M8  v0.3 release convergence
```

完整 release definition 见 [ROADMAP.zh-CN.md](./ROADMAP.zh-CN.md)，live contract 见 [`docs/specs`](./docs/specs)。

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
- **Prerelease freedom** —— 早期形态阻碍长期正确模型时，不为兼容背债。

## Compatibility Evidence

GitHub Actions 当前在 Node 22.19 / Node 24 上验证：

- 精确 upstream DSH release identity；
- DSH Session setup / publication / rollback；
- caller-bound DSH Agent owner context；
- Cordis parent / child teardown；
- Cordis reactive injection；
- Runtime capability provider isolation；
- SaaSDefinition -> CompositionPlan -> Tenant/Principal -> one-shot Operation -> 真实 DSH Agent create/resume/failure；
- packed external consumer 安装与执行。

Machine-readable ledger 在 [`docs/specs/v0.3-assumptions.json`](./docs/specs/v0.3-assumptions.json)。当前 `A1`–`A6` 全部 proven。

## Explicit Security Boundary

Cordis Context 是 trusted same-process composition / lifecycle boundary，不是 hostile-code sandbox。它不隔离 process memory、filesystem、shell、network、environment variable 或恶意同进程插件。

Strong isolation 属于 process/container/Pod deployment profile。

## v0.4 预告

v0.4 预计把 v0.3 Framework Core 扩展为更完整的 **Production Provider Ecosystem & Productization**：production identity provider、durable secrets / credentials、更丰富 MCP integration、operational provider、durable store / migration、更强 deployment profile 与更完善的 Distribution / 安装体验。

这里只是预告；详细 v0.4 Roadmap 会根据 v0.3 的真实 architecture 和使用证据再规划。

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
