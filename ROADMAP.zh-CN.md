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

## 更新后的 Definition of Value

MR-A 改变了我们对 Framework boundary 的理解。v0.3 不只是：

```text
SaaSDefinition -> Providers -> Agent
```

更准确的 north star 是：

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

这把以前描述得过于扁平的 concern 拆开：

- **Product Ingress** 选择可信 Runtime identity；
- **Runtime Capability** 存在于显式 Deployment/Tenant/Principal/Operation ownership 中；
- **Operation** 是一次 semantic execution boundary；
- **Agent Integration** 把可信 Runtime state 转换成 DSH-native Agent/Preset/plugin composition。

参见 [`docs/specs/saas-boundaries.zh-CN.md`](./docs/specs/saas-boundaries.zh-CN.md)。

只有整条路径做到 strongly typed、fail-fast、lifecycle-safe、replaceable，并能在真实 multi-tenant DSH vertical slice 中执行证明，v0.3 才算完成。

## 目标架构

```text
Product / Transport
        │
        ▼
Trusted Identity Resolution
        │
        ▼
Tenant / Principal Runtime
        │
        ▼
Typed Capability Composition
        │
        ▼
One-shot Operation
        │
        ▼
Agent Integration
        │
        ▼
Cordis / DeepSeek Harness
```

Auth、Credentials、MCP、Transport、Audit、Usage 继续只是 responsibility name，**不是提前批准的 package name**。

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

- `SaaSDefinition` 是 mutable intent，Runtime 不反复解释它；
- `CompositionPlan` 必须 normalized、deterministic、immutable；
- scope 名字对应真实 lifecycle / authority boundary；
- capability key、value type、scope 属于同一个 semantic token；
- Cordis 继续负责 DI/service/lifecycle；
- Operation 必须 Principal-owned，并在 semantic effect 上 one-shot；
- Product Ingress 与 Agent Integration 都是显式 boundary，不是隐藏在 Provider convention 中；
- blocking assumption open 时不能支撑 public API；
- Provider / Integration compatibility 必须有 executable evidence；
- package topology 跟着真实 architecture 长；
- prerelease compatibility 阻碍长期模型时可以直接丢掉。

---

# Milestone Status

## M0 —— Spec / Assumption Foundation —— ✅ 完成

已交付双语 live spec、machine-readable assumption、DSH/Cordis probe、Node 22.19/24 platform lane 与 promotion gate。

## M1 —— Composition Compiler —— ✅ 完成

MR-A 已交付：

- required / optional capability；
- provider selection；
- dependency graph / visibility；
- deterministic topological bootstrap order；
- immutable normalized Plan；
- semantic error taxonomy；
- 真实 scope authority，而不是 metadata；
- whole-plan structural fingerprint。

## M2 —— Principal Operation Kernel + A6 —— ✅ 完成

MR-A 证明最终 Operation primitive 不是 reactive `ctx.inject()` business work：

```text
Principal
  └─ non-reactive Operation Fiber
       ├─ Operation-local setup
       ├─ one-shot capability snapshot
       ├─ execute exactly once
       └─ quiescent teardown
```

`A6` 已在 Node 22.19 / Node 24 上 proven。

## M3 —— Multi-tenant real-DSH Core Vertical Slice —— ✅ 完成

Pinned public `@deepseek-ai/dsh-agent` AgentRegistry 从 Operation boundary 驱动多 Tenant / Principal create、resume、failure 路径；packed npm consumer 也执行同一 contract。

### M3 Package Boundary Gate —— 继续一个 Package

现在仍然不创建 `dsh-saas`。Runtime、typed composition、Operation 仍然是一套连贯 lifecycle contract。

---

## M3.5 —— Post-MR-A Architecture Hardening —— 当前

MR-A 刻意优先完整 vertical slice。实践暴露了两个结构债，必须在 product-facing capability 到来以前清掉。

### 1. Typed Capability Token

旧 API 允许：

```ts
capabilities.require<MyType>('credentials')
```

调用方可以自行声称任意 type，同时 Definition 中还会重复声明 scope。

Hardening 后使用：

```ts
CapabilityToken<T, Scope>
```

把 stable service key + semantic value type + authority scope 绑定起来。

可以提供 typed Cordis `get/provide` 薄 helper，但 Cordis 仍然是唯一 resolver / registry。

### 2. Scope-local Composition Identity

MR-A 初版把 whole-plan fingerprint 直接作为 canonical Tenant / Principal definition identity。安全但过度耦合：只改 Operation provider，也可能错误 invalidate Tenant。

Hardening 后：

```text
fingerprint                  exact whole-plan identity
scopeFingerprints[scope]     scope provider dependency closure
```

Canonical Tenant / Principal 使用自己的 scope-local closure identity。

**M3.5 Exit Gate：**

- Operation-only drift 不 invalid unrelated Principal / Tenant；
- Principal-only drift 不 invalid unrelated Tenant；
- 一个 scope 真正依赖到的 ancestor 改变时，该 scope identity 必须变化；
- typed capability consumption 在 source / packed artifact 都通过；
- docs/roadmap 明确拆开 Product Ingress、Runtime Capability、Agent Integration 三个 plane。

---

# 下一阶段：Product-facing Boundary Proof

旧 Roadmap 把 Authenticated Identity、Credentials、MCP 当成三个并列 capability contract。MR-A 已证明这种描述不够准确，所以重新定义 M4/M5。

## M4 —— Product Ingress + Principal Capability Contracts

M4 同时证明两个不同 boundary，因为它们在 canonical Principal selection 处汇合。

### A. Trusted Product Ingress

```text
authenticated product subject
        ↓
identity resolver
        ↓
TenantPrincipal
        ↓
canonical Tenant / Principal
```

Framework **不**负责 JWT/OAuth/OIDC/SAML parsing。它只拥有产品已经建立 trusted identity 之后的 semantic boundary。

第一版 reference adapter 应该保持 simple/callback，仅用于证明 contract。

### B. Principal Credentials Capability

Credentials 成为第一个真实 product-facing typed Runtime capability。

必须证明：

- Tenant isolation；
- Principal sibling isolation；
- lifecycle ownership；
- typed consumption；
- replacement 不改 Framework Core；
- secret state 不会误泄漏到 deployment/root authority。

**M4 Exit Gate：** Product Ingress 能选择正确 canonical Principal，并且该 Principal 能消费 replaceable typed Credentials capability，同时 vendor auth logic 不进入 Core。

## M5 —— Agent Integration Reference Path + Minimal Defaults

MCP 从“并列 Runtime capability”调整为最重要的 reference **Agent Integration** 路径。

目标：

```text
Tenant MCP configuration
        +
Principal credentials
        +
Operation snapshot
        ↓
Agent integration
        ↓
DSH Agent setup
        ↓
@deepseek-ai/dsh-mcp-client
        ↓
native DSH MCP tools
```

当前 pinned DSH baseline 里 Harness 正式 bridge 的是 MCP Tools。Resources / Prompts 还没有 Harness consumer，所以 v0.3 不自己造平行 compatibility protocol 模拟它们。

M5 只提供让这条链真实成立所需的最小 default：

- M4 的 simple identity adapter；
- 一个 in-memory/reference Credentials implementation；
- 一条真实 MCP Tools integration path；
- 至少一个 implementation replacement proof。

**M5 Exit Gate：** 一条真实 Product Ingress -> Tenant/Principal -> Credentials -> Operation -> DSH-native MCP Tool 链端到端成立；替换 conforming implementation 不需要改 Core。

M5 结束后重新评估 package boundary。

---

## M6 —— Diagnostics & Explainability

Framework 应该能够解释：

- 最终为什么选中某 provider；
- 哪个 typed capability / scope 拥有它；
- dependency closure 是什么；
- definition/provider/integration 为什么被拒绝；
- 哪个 scope fingerprint 控制 canonical identity；
- bootstrap 在哪里失败；
- normalized Plan 是什么。

Diagnostics 可能在 M3.5/M4/M5 过程中自然出现，但 M6 会把它收敛成正式 framework contract。

## M7 —— Conformance & Compatibility Hardening

Executable evidence 扩展到：

- typed capability identity；
- Composition validation / determinism；
- scope-local canonical drift；
- Tenant / Principal isolation / recreation；
- Operation prepare/active/cancel/failure/teardown/provider churn；
- Product Ingress identity mapping；
- Credentials replacement / failure；
- Agent Integration create/resume/setup/failure；
- DSH-native MCP Tools behavior；
- Node 22.19 / Node 24；
- pinned DSH/Cordis assumption；
- packed consumer behavior。

GitHub Actions 继续作为 upstream truth detector、architecture gate、regression firewall。

## M8 —— v0.3 Release Convergence

这一阶段不再发明新架构，只做收敛：

- 删除没有成为 architecture 的 research / intermediate surface；
- 只冻结已经挣出来的 public/package boundary；
- README/spec/reference 与真实代码对齐；
- 发布显式 compatibility/security boundary；
- packed / registry consumer smoke；
- install/distribution 保持最小化，除非 released contract 真的需要更多。

---

# v0.3 Golden Test

最终验收应该像真实 SaaS product flow：

```text
Trusted Product Request
        ↓
Tenant Acme / Alice
│       ├─ Credentials A
│       └─ Tenant MCP config A
│
├─ Tenant Acme / Bob
│       ├─ Credentials B
│       └─ Tenant MCP config A
│
└─ Tenant Globex / Alice
        ├─ Credentials C
        └─ Tenant MCP config B
```

并发 Operation 必须证明每个 DSH Agent / integration 只看到正确 identity、Tenant config、Principal credential；dispose/failure/recreation 一个 scope 不影响 sibling 与其他 Tenant。

同一 suite 还必须输入非法 Definition，并证明在用户流量进入前失败。

# v0.3 Definition of Done

1. typed `SaaSDefinition -> CompositionPlan` deterministic、fail-fast。✅ M3.5 后
2. canonical identity scope-local，不被无关 descendant 错误耦合。✅ M3.5 后
3. 一次用户动作拥有一个 semantic Operation boundary，A6 proven。✅
4. Principal -> Operation -> 真实 DSH create/resume/failure 有 CI evidence。✅
5. Product Ingress 把 trusted identity 映射到 canonical Runtime，vendor auth 不进入 Core。
6. Principal-owned typed Credentials contract 证明 replacement / isolation。
7. 至少一条 DSH-native Agent Integration 真正端到端可用。
8. semantic diagnostics 能解释 Plan selection/locality/failure。
9. platform assumption / provider / integration contract 在支持 baseline 上可执行。
10. package boundary 来自真实独立价值，而不是 speculative name。
11. 文档与安装说明准确描述用户真正获得的 artifact。

# v0.3 明确 Non-goals

不作为 v0.3 成功必要条件：

- 大量 OAuth/OIDC/SAML vendor integration；
- production Vault/Redis/Postgres credential ecosystem；
- 平行 MCP protocol stack；
- 为 DSH 当前没有 consumer 的 MCP Resources / Prompts 写 compatibility shim；
- Billing/Audit/Usage 产品；
- Web 管理后台；
- Plugin Marketplace / discoverability；
- 超出 released contract 所需的 Distribution/Profile polish；
- one-tenant-per-Pod orchestration；
- 任意 dynamic provider hot reconfiguration；
- 大型 migration/provider ecosystem。

---

# v0.4 预告 —— Production Provider Ecosystem & Productization

v0.4 把稳定 v0.3 boundary contract 扩展成更完整的 production-ready SaaS ecosystem。

方向可能包括 production identity integration、durable credentials/secrets、随着 DSH consumer 稳定而扩展更丰富 MCP capability、operational provider、durable store/migration、更强 deployment profile 与更完善 Distribution / 安装体验。

这仍然只是 **preview，不是详细 v0.4 roadmap**；准确范围根据 v0.3 architecture 与真实使用证据决定。

---

# 跨版本工程规则

- 全局设计优先于局部编辑；
- Spec / test 先于 public abstraction；
- 外部 assumption 必须 executable verification；
- 优先让 invalid state 无法表达；
- lifecycle / publication 显式建模；
- 使用 semantic TypeScript type，而不是 loose field；
- 技术正确性与战略相关性同时优化；
- prerelease compatibility 阻碍长期模型时不保留；
- Git history 足够时，从 live tree 删除 obsolete experiment；
- 使用 Cordis / DSH native abstraction，而不是平行 registry / fork；
- package boundary 只在独立价值被证明后创建；
- 控制得住的边界 enforce；依赖生态协作的边界 standardize；双方都控制不了的边界明确 document。

# Explicit Security Boundary

Cordis Context 是 trusted same-process composition/lifecycle boundary，不是 hostile-code sandbox。它不隔离 process memory、filesystem、shell、network、environment variable 或 malicious same-process plugin。Strong isolation 属于 process/container/Pod deployment boundary。
