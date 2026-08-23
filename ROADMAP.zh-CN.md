[English](./ROADMAP.md) | 简体中文

# Roadmap —— v0.2 Runtime Contract → v0.3 SaaS Framework

状态：✅ 已完成 · 🚧 当前 · 🤝 生态/上游协作 · 🧭 后续 · ⛔ 明确边界。

## 版本线策略

### v0.1 —— 冻结的 Security Kernel

已经发布的 v0.1 tag 冻结，继续表示：

- 最小 authenticated `TenantPrincipal`；
- 不可变 session ownership；
- fail-closed authorization；
- 可替换 `TenantSessionStore` contract。

v0.1 不再承担产品扩展。

### v0.2 —— Multi-Tenant Runtime Contract

目标：在任何 SaaS 产品能力叠加之前，先让 DSH 成为一个可以被稳定依赖的 multi-tenant runtime primitive。

当前 candidate：**`0.2.0-rc.2`**。

Runtime 统一建模为：

```text
Root -> Tenant -> Principal -> DSH Agent
```

这里 Principal → Agent 是 owner / composition boundary，不是 service graph 直接继承。DSH Agent / Preset scope 继续保持独立 plane。

### v0.3 —— SaaS Framework

只有在 v0.2 Runtime Contract 收口后才进入 v0.3。v0.3 才开始组合 Auth、transport binding、Agent orchestration、provider defaults、MCP SaaS integration、credentials、audit/usage，以及 opinionated distribution。

## 架构契约

| Plane | Owner | 作用 |
| --- | --- | --- |
| 持久授权 | `ctx.multiTenant` + `TenantSessionStore` | Durable session ownership invariant；永远 fail closed。 |
| Tenant capability graph | Cordis Context isolation | Tenant-local provider instance 与 lifecycle。 |
| Principal capability graph | Cordis Context isolation | User-local credential/policy/provider instance。 |
| Agent/Preset registration graph | DSH `@deepseek-ai/dsh-scope` | Agent-local tools/prompts/listeners 与 model-facing visibility。 |
| 强隔离 | process/container/K8S | Filesystem、shell、network、memory 与 hostile-code boundary。 |

禁止再造按 tenantId 索引的第二套 DI/container。Capability resolution 属于 Cordis Context。

## ✅ R0 —— v0.1 Kernel 保留

Security kernel 在 v0.2 中保持 deployment-global，不能被 Tenant / Principal graph 隔离掉。

## ✅ R1 —— `0.2.0-rc.1`：Architecture Proof

rc.1 已证明：

- Tenant / Principal 可以拥有真实 Cordis Context；
- service isolation 可以做到 A/B tenant separation；
- v0.1 Kernel 可以作为 defense in depth 保留；
- DSH Agent/Preset scope 可以和 Tenant capability plane 分离；
- two-tenant isolation、真实 Cordis Loader、packed external consumer 可以工作。

rc.1 回答的是：**这套架构能不能成立？**

## 🚧 R2 —— `0.2.0-rc.2`：Runtime Contract Convergence

rc.2 回答的是：**这套 Runtime 数据结构和生命周期语义，是否已经稳定到可以让 SaaS Framework 直接依赖？**

### P0-A —— Canonical Publication

- Tenant / Principal 创建统一改为 async transaction；
- reserve key → unpublished subtree → setup → optional sync commit → publish；
- `get()` 永远不暴露 preparing node；
- 同 key 并发 `ensure()` single-flight；
- setup 失败完整 rollback；
- active definition drift 明确失败。

### P0-B —— Canonical Principal Lifecycle

Tenant 与 Principal 统一使用：

```text
identity + kind + ctx + state + ensure/get + dispose
```

Principal registry 直接挂在 Tenant 下并以 `userId` 为 key，使错误 tenantId 从结构上无法表达。

Tenant teardown 先拥有并 drain Principal teardown，再完成自己 quiescence。

### P0-C —— DSH Agent Owner / Composition Boundary

对真实 DSH AgentRegistry 路径做可执行证明：

- `principal.ctx.agents.create()` 把准确的 Principal Context 作为 `ownerCtx` 传给 factory；
- Tenant / Principal identity 与 capability graph 在该边界保持正确；
- Agent `setup` 显式从 Principal Runtime composition / projection 所需能力；
- DSH Agent / Preset scope ancestry 继续独立。

**禁止**通过复制 Cordis 私有 isolation map 去伪造 Agent.ctx 的直接继承。

### P0-D —— Executable Tenant-Safe Provider Contract

提供 `assertRuntimeCapabilityProviderContract()`，让 Provider 自动证明：

- 同名 A/B isolation；
- root / parent 不泄漏；
- 合理的 descendant inheritance；
- sibling 不互相影响；
- disposal isolation；
- clean recreation；
- setup transaction 内的 lifecycle ownership。

这套 contract 是后续 Plugin Family 的基础。

## 🧭 R2.5 —— v0.2 最后收口

四个 P0 全绿之后，v0.2 只允许做 closure work，不再增加产品功能：

- teardown / concurrency adversarial tests；
- create/dispose/recreate stress-ish leak checks；
- 独立刷新完整 DSH dependency closure 到一个新的 pinned release；
- inventory / document 已知 DSH global-state gap；
- 不加入 Auth/Web/Billing/MCP 产品实现。

## v0.2 Exit Criteria

下面全部满足后进入 v0.3：

1. Tenant / Principal publication atomic 且 rollback-covered；
2. Tenant / Principal lifecycle semantics canonical、无歧义；
3. Principal → DSH Agent owner/composition seam 被 CI 的真实 probe 固化；
4. Tenant-Safe Provider Contract 可供第三方 provider 执行；
5. teardown / concurrency tests 在 Node 22 + 24 全绿；
6. packed external consumer + real Loader composition 全绿；
7. 一个现代 DSH baseline 通过全部 compatibility probes；
8. 新增 Auth/Transport/MCP/Agent SaaS package 不再要求修改 Runtime data model。

到这里：**冻结 v0.2 Runtime Contract，立即进入 v0.3。**

## 🧭 v0.3 —— SaaS Framework / Plugin Family

目标结构：

```text
                    dsh-saas
              opinionated SaaS distribution
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
     Auth            Credentials            MCP
      │                  │                  │
 Transport          Audit / Usage      Storage / Policy
      └──────────────────┼──────────────────┘
                         │
                dsh-multi-tenant
             Runtime Contract + Kernel
```

Distribution 提供开箱即用的产品体验；Plugin Family 提供替换与二次组合能力。

v0.3 重点：

- authenticated HTTP/WebSocket → Tenant / Principal binding；
- 从 Principal Runtime 编排 Agent creation；
- Auth / Credential / MCP provider slot 与 reference implementation；
- 默认 production composition；
- health / diagnostics / config validation；
- provider compatibility matrix；
- audit / usage foundation；
- shared-runtime 与 strong tenant-Pod 等 deployment profile。

## ⛔ 明确边界

Cordis Context 不是 hostile-code sandbox，不隔离 process globals、filesystem/shell、network、environment variables，也挡不住故意访问 `ctx.root` 的插件。

Strong tenant isolation 继续属于独立 process/container/Pod。产品级 billing、organization UI、IAM implementation 属于 v0.3 Plugin Family / distribution，不属于 v0.2 runtime core。
