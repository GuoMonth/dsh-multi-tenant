[English](./README.md) | 简体中文

# dsh-multi-tenant

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）真正成为 **Multi-Tenant Runtime**，并在不替换底层 DSH/Cordis 架构的前提下继续成长为可组合的 **SaaS Framework Core**。

> **已发布基础：** `dsh-multi-tenant@0.2.0-rc.3` —— canonical Tenant/Principal Runtime Contract + 冻结的 ownership kernel。
>
> **当前主开发线：** **v0.3 SaaS Framework Core** —— 强类型 composition、fail-fast validation、Principal-owned one-shot Operation、可替换 capability，以及可执行的 DSH/Cordis assumption evidence。
>
> **当前 DSH compatibility baseline：** `0.1.1-rc.2`，上游 release commit 为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。Baseline 显式固定并手动推进；CI 永远不追 floating `latest` 或 `master`。

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

v0.1 回答 **“谁拥有这个 Session”**；v0.2 回答 **“Tenant / Principal 在 Runtime 里是什么”**；v0.3 现在回答 **“一个 SaaS 产品如何通过这套 Runtime 声明、验证并执行可替换 capability”**。

## v0.3 正在做什么

v0.3 不是按功能数量验收的版本，也不是去做一个 monolithic SaaS super-plugin。它的目标是一条真正成立的 Framework Core 主链：

```text
SaaSDefinition
      ↓ normalize + validate
CompositionPlan
      ↓ bootstrap
canonical Tenant / Principal
      ↓
one semantic Operation
      ↓
capability acquisition
      ↓
DSH Agent create / resume / drive
      ↓
deterministic teardown
```

只有这条路径做到 strongly typed、fail-fast、lifecycle-safe，并且能够在多个 Tenant/Principal 上通过 CI executable vertical slice，v0.3 才算完成。

我们正在追求的核心 guarantee：

- 错误 capability composition 在用户流量进入前失败；
- Tenant / Principal capability state 在并发、失败和 teardown 下仍然隔离；
- 一次用户可见动作只对应一次 semantic Operation，dependency churn 不能悄悄造成 externally visible work 重复执行；
- Principal teardown 会 drain 自己的 Operation；
- DSH Agent create/resume 获得正确的 Principal-derived `ownerCtx`；
- Provider 可以替换，而不要求重写 Framework Core；
- 对 DSH/Cordis 的关键假设是 machine-readable，并在 GitHub Actions 里真实执行证明。

完整 milestone Roadmap 与 v0.3 Definition of Done 见 [ROADMAP.zh-CN.md](./ROADMAP.zh-CN.md)。

## v0.3 Roadmap 一览

```text
M0  P0 Spec / Assumption Foundation          ✅
M1  Composition Compiler
M2  Operation Kernel + 收口 A6
M3  Fake-provider 端到端 vertical slice
    └─ package-boundary decision gate
M4  最小 Auth / Credentials / MCP contracts
M5  最小 reference providers
M6  Diagnostics / explainability
M7  Conformance + compatibility hardening
M8  v0.3 release convergence
```

当前最关键的 Gate 是 **A6**：最终 Operation 设计必须证明 Cordis dependency reactivity 不会导致用户 externally visible work 被重复执行。在这条 proof 成立前，Operation public API 保持 unfrozen。

## Architecture Foundation

```text
Deployment / Root
│
├── shared TenantSessionStore
├── shared MultiTenantService          persistent authorization invariant
├── shared TenantRuntimeService
│
├── Tenant(acme)                       canonical runtime node
│   ├── tenant capability graph
│   ├── Principal(alice)               canonical runtime node
│   │   └── principal capability graph
│   └── Principal(bob)
│
└── Tenant(globex)
```

项目刻意拆成四个 plane，而不是让一个 tenant 机制包办所有职责：

1. **Persistent authorization** —— durable `(tenantId, userId) -> session` ownership，始终 fail closed；
2. **Tenant / Principal capability graph** —— Cordis Context service isolation 与 lifecycle；
3. **Agent / Preset registration graph** —— DSH `@deepseek-ai/dsh-scope`，负责 tool、prompt、listener 与 Agent-local visibility；
4. **Strong deployment isolation** —— process/filesystem/network/shell，必要时 one tenant per container / Pod。

v0.3 Framework 在这套结构**上方生长**。它不会复制 Cordis 私有状态到 Agent scope，也不会重新造第二套 DI/service registry。

## v0.1 冻结 Kernel

v0.1 的安全保证继续刻意保持小：

- 最小 authenticated `TenantPrincipal`；
- claim-once immutable session ownership；
- fail-closed access decision；
- 可替换 `TenantSessionStore` provider seam。

这些保证继续作为 deployment-global defense in depth。

## v0.2 Runtime Contract

Tenant 和 Principal 使用同一套结构语义：

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinition)
const alice = await tenant.principals.ensure('alice', principalDefinition)
```

两级都是 canonical runtime node，拥有 immutable identity、scoped Context、显式 lifecycle state、幂等 quiescent disposal，以及 canonical `ensure/get` registry。

创建过程是事务化的：

```text
reserve canonical identity
        ↓
prepare unpublished Cordis subtree
        ↓
await setup(signal)
        ↓
optional synchronous commit()
        ↓
publish active node
```

Preparing transaction 是 first-class lifecycle resource。半初始化 graph 不可见；并发 `ensure()` single-flight；setup 失败完整 rollback；definition drift 明确失败。

## Provider Ecosystem 方向

`dsh-multi-tenant/testing` 提供可执行 Runtime Capability Provider Contract，覆盖 A/B isolation、root/parent 不泄漏、descendant inheritance、sibling isolation、dispose isolation、recreation 与 unpublished setup ownership。

v0.3 会继续坚持同一原则：**Provider compatibility 是 contract，不是默认假设。**

Auth、Credentials、MCP、Transport、Audit、Usage 等名字是 capability responsibility，不是预先创建好的 package name。只有真实独立 contract、replacement boundary、lifecycle boundary、release boundary 或 Distribution boundary 被证明后，package 才出现。

## 工程方法

v0.3 所有工作遵循同一开发顺序：

```text
Spec
  → Assumption Ledger
  → executable external probe / contract test
  → strong types + state model
  → failing behavior test
  → smallest implementation
  → vertical-slice CI proof
```

核心原则：

- **Structure before patches** —— 先 ownership、数据结构和状态流转；
- **Strong semantic types** —— 让非法状态尽量无法表达；
- **Assumption-first verification** —— public API 依赖外部 DSH/Cordis 行为前，必须先有 executable evidence；
- **相关性优先于“正确性展示”** —— 技术上正确但已经不服务当前 architecture 的历史实验不继续占据 live tree；
- **控制得住 -> enforce；生态协作 -> standardize；控制不住 -> explicit boundary；**
- **不再造第二套 DI** —— Cordis 继续承担 service/lifecycle substrate；
- **不预判 package topology** —— package boundary 跟着已经证明的 architecture 走。

参见 [CONTRIBUTING.zh-CN.md](./CONTRIBUTING.zh-CN.md) 与 [`docs/specs`](./docs/specs) 下的 P0 Spec。

## Compatibility Evidence

CI 当前验证 active architecture 真正依赖的平台 seam：

- 精确 upstream DSH release identity；
- DSH session setup/publication/rollback 行为；
- Principal-derived DSH Agent owner/context composition；
- Cordis parent/child lifecycle；
- Cordis reactive dependency injection 行为；
- Runtime capability provider isolation contract。

仍然 open 的 blocking assumption 记录在 [`docs/specs/v0.3-assumptions.json`](./docs/specs/v0.3-assumptions.json)，而不是藏在 implementation 里。

## 当前 Package

[`packages/multi-tenant`](./packages/multi-tenant) 仍然是当前唯一 live workspace package，通过 npm `dsh-multi-tenant`（`latest`）发布，包含 v0.2 Runtime Contract 与冻结的 v0.1 ownership kernel。

v0.3 不会提前创建 `saas`、Auth、MCP 或其他 Provider package。只有当独立价值被实现真正证明后，才决定 package boundary。

## v0.4 预告

v0.4 预计把 v0.3 Framework Core 扩展成更完整的 **production provider ecosystem 与产品化 SaaS 体验**：production identity integration、durable credentials/secrets、更丰富的 MCP integration、Audit/Usage/Observability、durable store 与 migration、更强 deployment profile，以及更完善的开箱即用 Distribution / 安装体验。

这里刻意只是预告。详细 v0.4 Roadmap 会根据 v0.3 真实形成的 architecture 与使用证据再规划。

## 安装

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

当前阶段不需要 Marketplace 或自定义 installer。npm + DSH-native plugin/bundle 路径就是支持的安装 baseline。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

## License

MIT
