[English](./ROADMAP.md) | 简体中文

# Roadmap

项目当前处于快速 prerelease 开发阶段。我们优先长期正确的架构、数据结构、生命周期语义与显式 contract，而不是为了保留早期形态制造兼容债。

版本演进是逐层累积的：

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
- claim-once immutable session ownership；
- fail-closed authorization；
- 可替换 `TenantSessionStore` contract。

这一层应该保持小、稳定、无聊。

## v0.2 —— 已发布的 Multi-Tenant Runtime Contract

`dsh-multi-tenant@0.2.0-rc.3` 是 v0.3 直接组合、而不是重写的公开 Runtime foundation。

```text
Deployment / Root
  ├─ shared ownership kernel
  └─ TenantRuntimeService
       └─ Tenant                  canonical capability node
            └─ Principal         canonical capability node
                 └─ derived integration fibers
                      └─ DSH Agent / product operations
```

v0.2 的长期 contract 包括：

- canonical Tenant / Principal identity 与 lifecycle；
- Principal 结构性归属于 Tenant；
- unpublished setup 与显式 publication boundary；
- 可取消 preparing transaction 与 quiescent teardown；
- Cordis-backed capability isolation；
- 独立的 DSH Agent/Preset scope 语义；
- caller-bound DSH `ownerCtx` composition；
- 可执行 provider isolation contract；
- 显式 DSH compatibility baseline 与 probe。

历史 Web/ApiProxy 与全局 admission-decorator 研究继续由 Git history 保存，不再作为 live architecture。

---

# v0.3 —— SaaS Framework Core

## v0.3 到底意味着什么

v0.3 是项目从 **安全的 Multi-Tenant Runtime** 迈向 **可执行 SaaS Framework Core** 的版本。

我们不会因为“已经写了几个 Provider”就认为 v0.3 完成。只有当 Framework 能够接收可信的 SaaS intent，把它编译成经过验证的 capability graph，把一次工作结构性绑定到一个 canonical Principal，通过 one-shot Operation 驱动 DSH Agent create/resume，并且能够确定性 teardown，v0.3 才算成立。

v0.3 的 north-star 路径是：

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

### v0.3 最终给开发者/用户带来的效果

到 v0.3 结束时，Framework consumer 应该能够声明一套 SaaS capability composition，并依赖 Framework 保证：

- 错误 composition 在用户流量进入前失败；
- Tenant A 与 Tenant B 不共享 tenant-local capability state；
- Principal sibling 不共享 principal-local capability state；
- 一次用户可见动作只对应一次 semantic Operation；
- provider/dependency churn 不会悄悄重复 externally visible Operation work；
- Principal teardown 会 drain 自己的 active/preparing Operations；
- DSH Agent create/resume 使用正确的 Principal-derived `ownerCtx`；
- 替换 Provider 不要求重写 Framework Core；
- 对 DSH/Cordis 的外部假设由 CI executable evidence 证明，而不是靠文档默认成立。

这就是 v0.3 的 Definition of Value。

## v0.3 目标架构

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

Auth、Credentials、MCP、Transport、Audit、Usage 等名字描述的是 capability responsibility，**不是提前批准好的 package name**。只有独立 API、replacement boundary、lifecycle boundary、release boundary 或 Distribution boundary 被真实证明后，package 才出现。

## v0.3 工程铁律

所有 milestone 都继承 P0 的开发顺序：

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

- `SaaSDefinition` 表示用户/Distribution intent；Runtime 不反复重新解释它。
- `CompositionPlan` 必须 normalized、deterministic，并且不存在 unresolved ambiguity。
- Cordis 继续负责 DI/service/lifecycle；v0.3 不重新造 `ServiceRegistry` / `ProviderContainer`。
- Operation 必须由 Principal 拥有、ephemeral，并且在 semantic effect 上 one-shot。
- blocking external assumption 只要 Assumption Ledger 仍是 `open`，就不能支撑 public API。
- Provider compatibility 是 contract，不是因为 `ctx.provide()` 跑通过一次就默认成立。
- package topology 必须跟着已经证明的架构走，而不是提前预测未来。

---

## v0.3 Milestone Roadmap

### M0 —— P0 Foundation —— 已完成

工程底座已经合并。

已交付：

- Composition 与 Operation lifecycle 双语 P0 Spec；
- machine-readable Assumption Ledger；
- DSH/Cordis executable platform probe；
- Node 22.19 / Node 24 的 CI platform-assumption lane；
- public API promotion gate，阻止未证明的 blocking assumption 偷偷进入 contract。

当前最关键的 open gate：

- **A6** —— 最终 one-shot Operation dependency-acquisition model 必须证明 provider churn 不会造成 externally visible work 重复执行。

### M1 —— Composition Compiler

在任何真实 Provider 产品反向塑造抽象前，实现最小 `SaaSDefinition -> CompositionPlan` 模型。

P0 vocabulary 只覆盖第一个 vertical slice 真正需要的内容：

- stable capability key；
- semantic ownership scope：`deployment | tenant | principal | operation`；
- required / optional capability；
- provider binding；
- provider dependency edge；
- single/multiple cardinality 只有真实 use case 出现时才加入；
- deterministic default selection 与 bootstrap order。

Compiler 必须使用 machine-distinguishable semantic error 拒绝：

- required capability 缺失；
- exclusive slot 出现重复 provider；
- scope incompatibility；
- dependency visibility violation；
- dependency cycle；
- canonical definition conflict。

**Exit Gate：** 合法 input 永远得到 deterministic immutable plan；非法 input 在 Runtime bootstrap 前失败。

### M2 —— Operation Kernel + A6 收口

定义 one-shot Principal Operation lifecycle，不能把 Cordis reactive injection 错当成一次用户 transaction。

Operation model 必须覆盖：

- 结构上只归属于一个 Principal；
- prepare / active / cancel / fail / dispose 的显式 lifecycle state；
- one-shot dependency acquisition，或等价且被证明不会 re-entry 重复执行的设计；
- cancellation 与 parent-disposal propagation；
- Operation-local resource exactly-once cleanup；
- idempotent、quiescent cancellation/disposal；
- causal error preservation；
- 安全的 Agent create/resume boundary。

**Hard Exit Gate：** A6 从 `open` 变成 `proven`。在此之前不冻结 public Operation API。

### M3 —— Fake Provider 端到端 Vertical Slice

在引入生产 Provider integration 以前，先把 M1 与 M2 真正连起来。

使用 fake/test capability，证明：

```text
SaaSDefinition
  → CompositionPlan
  → Tenant
  → Principal
  → Operation
  → capability acquisition
  → DSH Agent create/resume
  → Agent publication
  → teardown
```

Vertical slice 必须并发覆盖多个 Tenant 与 Principal，并证明 isolation、publication safety 与 teardown。

**Package Boundary Gate：** 只有到这个 milestone 之后，才判断 Composition + Operation 是否已经形成真正独立、值得发布的 public package boundary，例如未来可能出现的 `dsh-saas`。Roadmap 不提前批准这个结论。

### M4 —— 最小 SaaS Capability Contracts

只有 Framework Core 用 fake capability 跑通以后，具体产品 concern 才开始影响稳定 contract。

v0.3 只聚焦能够证明 SaaS model 的最小 contract，优先级是：

- **Authenticated Identity Boundary** —— trusted external subject -> canonical `TenantPrincipal`；
- **Credentials Capability** —— Principal-owned credential，并保持 sibling/tenant isolation；
- **MCP Capability** —— Tenant/Principal-aware MCP composition，被 Operation/Agent 安全消费。

目标是 contract quality 与 replacement semantics，不是 vendor 数量。

### M5 —— 最小 Reference Providers

只提供足够的真实/default implementation，证明 Framework 真能用，而且 Provider replacement 不是纸面设计。

可能包括：

- 简单 static / callback identity adapter；
- in-memory/reference credential provider；
- 一条真实可工作的 MCP 路径，用来同时验证 Tenant config + Principal credential + Operation consumption；
- 必要时复用现有 in-memory/reference durable store capability。

**Exit Gate：** 把 reference provider 替换成另一个符合 contract 的 implementation，不需要修改 Framework Core。

### M6 —— Diagnostics & Explainability

Composition Framework 在“好用”之前，首先必须“可诊断”。

v0.3 至少应提供 framework-level validation/explanation，能够回答：

- 某 capability 最终为什么选中了这个 Provider；
- 它属于哪个 Runtime scope；
- 它依赖哪些 capability；
- 某 Provider / definition 为什么被拒绝；
- bootstrap 在哪里失败；
- normalized `CompositionPlan` 最终是什么。

最终 public API 形状可以继续演进，但 semantic diagnostics 必须进入 v0.3，因为它会反向验证底层数据模型是否真的清晰。

### M7 —— Conformance & Compatibility Hardening

把 executable evidence 从 Runtime kernel 扩展到 SaaS Framework Core。

至少覆盖：

- Composition：missing、duplicate、scope mismatch、visibility violation、cycle、deterministic normalization；
- Isolation：Tenant A/B、Principal sibling、teardown、clean recreation；
- Operation：preparing、active、cancel、failure、parent teardown、provider churn、idempotent cleanup；
- DSH：create、resume、ownerCtx、setup/publication failure；
- Provider replacement 与 failure behavior；
- Node 22.19 / Node 24 platform lane；
- 精确 DSH/Cordis assumption evidence。

GitHub Actions 继续承担 upstream truth detector、architecture gate 与 regression firewall。

### M8 —— v0.3 Release Convergence

只有 Golden Path 与 conformance gate 全绿以后，才冻结 v0.3 public contract。

Release convergence 包括：

- 删除最终没有成为 architecture 的 research surface；
- 只冻结实现已经证明存在独立价值的 package boundary；
- README/spec/reference docs 与真实 public contract 完全一致；
- packed/registry consumer smoke 验证用户真正安装到的 artifact；
- 发布清晰 compatibility matrix 与 explicit security boundary；
- 安装/分发机制继续保持最小化，除非 released contract 本身确实需要更多能力。

---

## v0.3 Golden Test

最终验收不能只测一个 toy single-scope example，而应该模拟真实 multi-tenant composition。

概念上：

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

并发 Operation 必须证明：每个 Agent 只看到正确 Tenant capability、Principal credential 与 MCP composition；create/resume 使用正确 session 与 owner context；dispose 一个 Principal 只 drain 自己的 Operation；sibling 与其他 Tenant 不受影响。

同一验收 suite 还必须输入 Missing Capability、Duplicate Exclusive Provider、Dependency Cycle、Scope Mismatch 等坏 definition，并证明它们在构造 `CompositionPlan` 阶段、用户流量进入前失败。

## v0.3 Definition of Done

满足下面全部条件，v0.3 才算完成：

1. `SaaSDefinition -> CompositionPlan` deterministic、strongly typed、fail-fast。
2. Operation model 让一次用户可见动作拥有一个 semantic execution boundary，并且 A6 已 proven。
3. Principal -> Operation -> DSH create/resume 是 CI 可执行 vertical slice。
4. Tenant / Principal capability isolation 在并发、失败、teardown、recreation 下仍成立。
5. 最小 Authenticated Identity、Credentials、MCP capability contract 证明 replacement model，不把 vendor 产品塞回 core。
6. 至少一套 reference composition 真实端到端可用。
7. semantic diagnostics 能解释最终 plan 与 failure cause。
8. platform assumption 与 provider contract 能在支持的 Node/DSH/Cordis baseline 上执行证明。
9. package boundary 来自真实独立价值，而不是 speculative capability name。
10. 当前文档与安装说明准确描述用户真正获得的 artifact。

## v0.3 明确 Non-goals

这些内容不作为 v0.3 成功的必要条件：

- 大量 OAuth/OIDC/SAML vendor integration；
- production Vault/Redis/Postgres credential ecosystem；
- 完整 MCP Apps/Resources 产品 UX；
- Billing、Audit、Usage 产品；
- Web 管理后台；
- Plugin Marketplace / discoverability；
- 超出 released contract 所需的 Distribution/Profile polishing；
- one-tenant-per-Pod orchestration；
- 任意 dynamic provider hot-reconfiguration；
- 大规模 migration/provider ecosystem。

这些事情不能拖慢 SaaS Framework Core。

---

# v0.4 预告 —— Production Provider Ecosystem & Productization

v0.4 是把 v0.3 Framework Core 扩展成更广泛、面向生产的 SaaS ecosystem 的阶段。

预期效果是：团队可以直接基于 v0.3 稳定的 composition / Operation contract，选择 production-grade integration，而不是每个外围能力都自己重写。

方向上可能包括：

- production authentication / identity integration；
- durable credential / secret provider；
- 在 DSH 提供稳定 seam 的前提下增强 MCP / MCP Apps / Resources integration；
- Audit、Usage、Observability 与 operational provider；
- durable store、migration 与 compatibility tooling；
- deployment profile，包括更强的 process/container/Pod isolation 选项；
- 更完善的开箱即用 Distribution 与安装体验；
- ecosystem/provider 文档与 conformance certification。

这里刻意只是 **preview，不是详细 v0.4 Roadmap**。v0.4 的精确 scope 应该根据 v0.3 真实形成的 architecture 和使用证据再规划，而不是今天提前承诺。

---

## 跨版本工程规则

- 先全局设计，再局部修改；
- specification / test 先于 public abstraction；
- external assumption 必须通过 executable evidence 验证；
- 优先使用让非法状态不可表达的数据结构；
- 显式建模 lifecycle 与 publication state；
- 用 strong semantic TypeScript type 替代松散字段约定；
- 除技术正确性外，也必须考虑与当前产品方向的相关性；
- prerelease 阶段如果兼容性损害长期模型，直接破坏兼容；
- Git history 足够保存的旧实验，不继续占据 live tree；
- 使用 Cordis / DSH 原生抽象，不另造平行 registry 或本地 fork；
- package boundary 只有在独立价值被证明后才创建；
- 仓库控制得住的边界严格 enforce，需要生态协作的定义标准，双方都无法可靠 enforce 的明确 boundary。

## Explicit Security Boundary

Cordis Context 是 trusted same-process composition / lifecycle boundary，不是 hostile-code sandbox。它不隔离 process memory、filesystem、shell、network、environment variable 或任意同进程恶意插件。Strong isolation 属于 process / container / Pod deployment boundary。
