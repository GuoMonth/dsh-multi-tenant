[English](./ROADMAP.md) | 简体中文

# Roadmap

项目处于快速 prerelease 开发阶段。我们优先长期正确的架构、数据结构、生命周期语义与显式 contract，而不是为了保留早期形态制造兼容债。

```text
v0.1  Security Kernel
  ↓
v0.2  Multi-Tenant Runtime Contract
  ↓
v0.3  SaaS Framework Core
  ↓
v0.4  Production Provider Ecosystem & Productization
```

## v0.1 —— 冻结的 Security Kernel

v0.1 负责 durable authorization invariant：

- 最小 `{ tenantId, userId }` principal identity；
- claim-once immutable Session ownership；
- fail-closed authorization；
- 可替换 `TenantSessionStore` contract。

这一层应该保持小、稳定、无聊。

## v0.2 —— 已发布的 Multi-Tenant Runtime Contract

`dsh-multi-tenant@0.2.0-rc.3` 是 v0.3 直接组合、而不是重写的 Runtime foundation。

```text
Deployment / Root
  ├─ shared ownership kernel
  └─ TenantRuntimeService
       └─ Tenant                  canonical capability node
            └─ Principal         canonical capability node
```

v0.2 已经稳定下来的 contract 包括 canonical identity/lifecycle、unpublished setup、显式 publication、可取消 preparing transaction、Cordis capability isolation、quiescent teardown、DSH caller-bound `ownerCtx` evidence 与 executable provider isolation contract。

历史 Web/ApiProxy/global-admission 研究继续留在 Git history，不再作为 live architecture。

---

# v0.3 —— SaaS Framework Core

## Definition of Value

v0.3 让项目从 **安全的 Multi-Tenant Runtime** 跨到 **可执行 SaaS Framework Core**。

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

v0.3 不按 feature 数量验收。只有这条主链做到 strongly typed、fail-fast、lifecycle-safe、replaceable，并能在真实 multi-tenant DSH vertical slice 中执行证明，v0.3 才算完成。

最终 Framework 必须保证：

- 非法 composition 在用户流量进入前失败；
- Tenant / Principal capability state 保持隔离；
- canonical Runtime node 不会悄悄采用 structurally different composition；
- 一次用户可见动作对应一次 semantic Operation；
- provider churn 不会悄悄重复 Operation work；
- Principal teardown 会 drain 自己的 Operation；
- DSH create/resume 获得正确 caller-bound Tenant/Principal/Operation Context；
- Provider 可以替换，而不要求改 Framework Core；
- 关键 DSH/Cordis assumption 永远有 executable CI evidence。

## 目标架构

```text
                         SaaS Framework Core
                                │
                       Composition Compiler
                                │
                        CompositionPlan
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
           Tenant            Principal          Operation
             │                  │                  │
             └──────── Capability Contracts ──────┘
                                │
                     Replaceable Providers
                                │
                       dsh-multi-tenant
                                │
                         Cordis + DSH
```

Auth、Credentials、MCP、Transport、Audit、Usage 是 capability responsibility，**不是提前批准好的 package name**。

## 工程铁律

```text
Spec
  → Assumption Ledger
  → executable probe / contract test
  → strong types + state model
  → failing behavior test
  → smallest implementation
  → vertical-slice CI proof
```

额外规则：

- `SaaSDefinition` 是 intent，Runtime 不反复解释它；
- `CompositionPlan` 必须 normalized、deterministic、immutable；
- scope 名字必须对应真实 lifecycle / authority boundary；
- Cordis 继续负责 DI/service/lifecycle；
- Operation 必须 Principal-owned，并在 semantic effect 上 one-shot；
- blocking assumption 仍 open 时不能支撑 public API；
- Provider compatibility 必须是 executable contract；
- package topology 跟着真实 architecture 长；
- prerelease compatibility 阻碍长期模型时可以直接丢掉。

---

# Milestone Status

## M0 —— P0 Spec / Assumption Foundation —— ✅ 完成

已交付：

- SaaS Composition / Operation lifecycle 双语 live spec；
- machine-readable Assumption Ledger；
- DSH/Cordis executable probe；
- Node 22.19 / Node 24 platform-assumption lane；
- blocking open assumption 不能进入 public API 的 promotion rule。

## M1 —— Composition Compiler —— ✅ 完成

已建立：

```text
SaaSDefinition
      ↓
compileSaaSDefinition()
      ↓
immutable CompositionPlan
```

Compiler 当前提供：

- stable capability key；
- `deployment | tenant | principal | operation` ownership vocabulary；
- required / optional capability；
- deterministic provider selection；
- provider dependency graph；
- deterministic topological bootstrap order；
- immutable normalized Plan；
- deterministic structural fingerprint。

它会在 bootstrap 前拒绝 duplicate / unknown / missing / ambiguous provider、scope mismatch、假 scoped ambient provider、dependency visibility violation 与 cycle。

### Scope 是 Authority，不是 Metadata

Ambient external provider 只允许 deployment scope。Tenant / Principal / Operation provider 必须真的在对应 Cordis scope materialize。

### Canonical Plan Drift

Plan fingerprint 会进入 Runtime definition identity：

```text
saas:tenant:<plan fingerprint>
saas:principal:<plan fingerprint>
```

Equivalent Plan 可以 join 同一个 canonical node；structurally different Plan 会抛 `RuntimeDefinitionConflictError`，而不是悄悄共用 active Tenant / Principal。

v0.3 不定义 Plan hot mutation。

## M2 —— Principal Operation Kernel + A6 —— ✅ 完成

最终 A6 设计不是 reactive `ctx.inject()` business work，而是：

```text
Principal
  └─ non-reactive Operation Fiber
       ├─ operation-local provider setup
       ├─ one-shot capability snapshot
       ├─ execute exactly once
       └─ quiescent teardown
```

已交付：

- Principal-owned Operation registry；
- 显式 semantic lifecycle state；
- one-shot required capability snapshot；
- provider churn 不会造成 re-entry；
- 显式 cancellation signal；
- Principal teardown 先 close admission 再 drain Operation；
- 幂等 / quiescent cancel 与 dispose；
- causal downstream error；
- semantic Operation error taxonomy。

`A6` 已经 **proven**。Cordis reactive injection 继续用于 plugin lifecycle，但不再被误当成 user transaction primitive。

## M3 —— Multi-tenant DSH Core Vertical Slice —— ✅ 完成

CI 直接运行 pinned public `@deepseek-ai/dsh-agent` AgentRegistry，从新 Operation boundary 驱动真实 create/resume seam。

Executable proof 并发覆盖：

```text
Acme / Alice   -> create
Acme / Bob     -> create
Globex / Alice -> create
Acme / Alice   -> resume
Acme / Alice   -> create failure
```

它证明：

- DSH factory `ownerCtx` 中 Tenant / Principal identity 正确；
- Tenant、Principal、Operation-local capability 可见性正确；
- 每个 Operation 只执行一次；
- Agent setup 在 handle 返回前完成；
- create/resume caller binding 正确；
- downstream create failure 保留 causal error；
- failed Operation 不留下 live registry entry；
- dispose 一个 Tenant 不影响另一个 Tenant；
- successful handle 被完整 drain。

同一套 contract 还会通过 **packed npm tarball** 安装到 clean consumer 后再次执行，而不是只测 workspace source。

### M3 Package Boundary Gate —— 结论：继续一个 Package

M3 以后仍然**不创建** `dsh-saas`。

Composition + Operation 目前是在扩展同一套 Runtime ownership / lifecycle contract，还没有证明足够独立的 versioning / distribution value。

当前 public subpath：

```text
dsh-multi-tenant/runtime
dsh-multi-tenant/operation
dsh-multi-tenant/composition
dsh-multi-tenant/testing
```

这个决定不是永久的。M4/M5 出现真实 SaaS capability contract 后再重新判断；在证据不足时保持一个 package，更轻、更自由、噪音更少。

---

# 当前主线：M4 + M5

MR-B 的目标是证明 **capability ecosystem**，不是堆 Provider 数量。

## M4 —— 最小 SaaS Capability Contracts

优先只做三条：

### 1. Authenticated Identity Boundary

```text
trusted external authenticated subject
        ↓
TenantPrincipal
        ↓
canonical Tenant / Principal
```

Framework 不负责 JWT/OAuth/SAML parsing；它只拥有“外部认证已经建立可信 identity”之后的 semantic boundary。

### 2. Credentials Capability

Principal-owned credential contract 必须保持：

- Tenant isolation；
- Principal sibling isolation；
- lifecycle ownership；
- 显式 consumer boundary；
- Provider replacement 不改 Framework Core。

### 3. MCP Capability

MCP 是最有价值的 reference capability，因为它天然同时测试：

```text
Tenant configuration
      +
Principal credential
      +
Operation consumption
      +
DSH Agent composition
```

只在 DSH / MCP 有稳定 native seam 的地方组合，不再造平行 protocol stack。

**M4 Exit Gate：** contract 足够小、可替换、可解释，且 vendor-specific 假设没有泄漏进 Framework Core。

## M5 —— 最小 Reference Providers

只提供足够证明 contract 真能用的 default/reference implementation。

可能包括：

- simple/callback authenticated identity adapter；
- in-memory/reference credential provider；
- 一条真实 MCP integration path；
- 必要时复用现有 reference ownership store。

不要把 M5 变成 Auth0/Okta/Vault/Redis/Postgres/vendor breadth。

**M5 Exit Gate：** 替换 reference provider 不需要修改 Framework Core，并且一条真实 Auth -> Principal -> Credentials -> MCP -> Operation -> DSH Agent 链端到端成立。

M5 结束后再次评估是否真正出现独立 SaaS/package boundary。

---

## M6 —— Diagnostics & Explainability

Composition Framework 必须能解释自己：

- 最终为什么选这个 provider；
- 哪个 scope 拥有它；
- 它依赖什么；
- definition/provider 为什么被拒绝；
- bootstrap 在哪里失败；
- normalized Plan / fingerprint 是什么；
- 当前 canonical Runtime definition 是什么。

Diagnostic 不清楚通常意味着模型本身不清楚，因此它属于 v0.3 contract，而不是 UI polish。

## M7 —— Conformance & Compatibility Hardening

Executable evidence 扩展到：

- Composition validation / determinism；
- Plan / canonical drift；
- Tenant / Principal isolation；
- Operation prepare/active/cancel/failure/teardown/provider churn；
- DSH create/resume/setup/publication/failure；
- Provider replacement / failure；
- Node 22.19 / Node 24；
- pinned DSH/Cordis assumption；
- packed consumer behavior。

GitHub Actions 继续承担 upstream truth detector、architecture gate、regression firewall。

## M8 —— v0.3 Release Convergence

这一阶段不再发明新架构，只做收敛：

- 删除没有成为 architecture 的 research / intermediate surface；
- 只冻结已经挣出来的 public/package boundary；
- README/spec/reference 与真实代码对齐；
- 发布清晰 compatibility/security boundary；
- packed/registry consumer smoke；
- install/distribution 保持最小化，除非 released contract 真正需要更多。

---

# v0.3 Golden Test

最终验收模拟真实 SaaS composition：

```text
Tenant Acme
├─ Alice
│  ├─ Credentials A
│  └─ MCP A
└─ Bob
   ├─ Credentials B
   └─ MCP A

Tenant Globex
└─ Alice
   ├─ Credentials C
   └─ MCP B
```

并发 Operation 必须证明每个 DSH Agent 只看到正确 Tenant capability、Principal credential、MCP composition；dispose/failure/recreation 仍保持 sibling 与 cross-Tenant isolation。

同一 suite 还要输入非法 Definition，并证明在用户流量进入前失败。

# v0.3 Definition of Done

1. `SaaSDefinition -> CompositionPlan` deterministic、strongly typed、fail-fast。✅
2. 一次用户动作拥有一个 semantic Operation boundary，A6 proven。✅
3. Principal -> Operation -> 真实 DSH create/resume/failure 有 CI evidence。✅
4. Tenant / Principal capability isolation 在并发、失败、teardown、recreation 下成立。
5. 最小 Authenticated Identity / Credentials / MCP contract 证明 replacement model，vendor product 不进入 Core。
6. 至少一套 reference composition 真实端到端可用。
7. semantic diagnostics 可以解释 Plan selection / failure。
8. platform assumption / provider contract 在支持 baseline 上可执行。
9. package boundary 来自真实独立价值，而不是 speculative name。✅ M3 当前结论：继续一个 package。
10. 文档与安装说明准确描述用户真正获得的 artifact。

M4–M8 会逐步完成其余条目。

# v0.3 明确 Non-goals

不作为 v0.3 成功必要条件：

- 大量 OAuth/OIDC/SAML vendor integration；
- production Vault/Redis/Postgres credential ecosystem；
- 完整 MCP Apps/Resources 产品 UX；
- Billing/Audit/Usage 产品；
- Web 管理后台；
- Plugin Marketplace / discoverability；
- 超出 released contract 所需的 Distribution/Profile polish；
- one-tenant-per-Pod orchestration；
- 任意 dynamic provider hot reconfiguration；
- 大规模 migration/provider ecosystem。

这些事情不能拖慢 Framework Core。

---

# v0.4 预告 —— Production Provider Ecosystem & Productization

v0.4 把稳定的 v0.3 contract 扩展成更完整的 production-ready SaaS ecosystem。

方向上可能包括：

- production authentication / identity integration；
- durable credential / secret provider；
- DSH 有稳定 seam 时增强 MCP / MCP Apps / Resources；
- Audit、Usage、Observability、operational provider；
- durable store / migration / compatibility tooling；
- 更强 process/container/Pod deployment profile；
- 更完善开箱即用 Distribution / 安装体验；
- ecosystem provider 文档 / conformance certification。

这里仍然只是 **preview，不是详细 v0.4 Roadmap**。精确 scope 等 v0.3 的真实 architecture 与使用证据形成后再规划。

---

# 跨版本工程规则

- 先全局设计，再局部修改；
- specification / test 先于 public abstraction；
- external assumption 必须有 executable evidence；
- 优先让非法状态无法表达；
- 显式建模 lifecycle / publication；
- 用 semantic TypeScript type 替代松散字段；
- 相关性和技术正确性同样重要；
- prerelease compatibility 损害长期模型时直接丢掉；
- Git history 足够保存的旧实验不继续占据 live tree；
- 使用 Cordis / DSH 原生抽象，不造平行 registry / fork；
- package boundary 只有在独立价值被证明后才创建；
- 控制得住 -> enforce；需要生态协作 -> standardize；控制不住 -> explicit boundary。

# Explicit Security Boundary

Cordis Context 是 trusted same-process composition/lifecycle boundary，不是 hostile-code sandbox。它不隔离 process memory、filesystem、shell、network、environment variable 或恶意同进程插件。Strong isolation 属于 process/container/Pod deployment boundary。
