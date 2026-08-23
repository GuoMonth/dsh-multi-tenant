[English](./ROADMAP.md) | 简体中文

# Roadmap —— v0.2 Multi-Tenant Runtime

状态：✅ 已完成 · 🚧 当前 · 🤝 生态/上游协作 · 🧭 后续 · ⛔ 明确边界。

## 版本线策略

### v0.1 —— 冻结

已经发布的 v0.1 tag 冻结，继续表示纯授权 Kernel：

- 最小 `TenantPrincipal`；
- 不可变 session ownership；
- fail-closed authorization；
- 可替换 `TenantSessionStore` contract。

v0.1 不再做新功能；真正的 Runtime 扩展全部进入 v0.2。

### v0.2 —— 当前主线

目标：**让 DeepSeek Harness 真正成为 Multi-Tenant Runtime**。

当前 candidate：`0.2.0-rc.1`。
本 PR 的可执行 DSH compatibility target：`0.1.0-rc.7`（仓库已经验证的 lockfile 闭包）。当前上游 `0.1.1-rc.2` 的 scope 行为已审阅；依赖升级独立处理。

## 架构契约

Runtime 刻意拆成不同 plane，而不是让一个“tenant 机制”承担所有职责。

| Plane | Owner | 作用 |
| --- | --- | --- |
| 持久授权 | `ctx.multiTenant` + `TenantSessionStore` | Session ownership invariant；永远 fail closed。 |
| Tenant capability graph | Cordis Context service isolation | Tenant-local auth/MCP/credential/provider instance 与生命周期。 |
| Principal capability graph | Cordis Context service isolation | Tenant 下的 user-local OAuth/credential/policy provider。 |
| Agent/Preset registration view | DSH `@deepseek-ai/dsh-scope` | Tools、prompt、listener 与 model-facing registration visibility。 |
| 强运行时隔离 | Deployment/container/K8S | Process、filesystem、shell、network、memory。 |

Tenant Runtime **禁止**再造一套按 tenantId 索引的 DI/service registry。Cordis Context 就是 dependency scope。

## ✅ R0 —— 保留 v0.1 Kernel

v0.1 security kernel 完整保留进 v0.2。`multiTenant`、`tenantSessionStore`、`tenantRuntime` 以及 Cordis core service 都属于 reserved shared services，不能被 Tenant Context 隔离掉。

## 🚧 R1 —— Context-native Runtime（`0.2.0-rc.1`）

交付第一版可执行 runtime primitive：

- `ctx.tenantRuntime`；
- 每个 tenantId 一套 canonical live Tenant Context；
- Tenant 下的 Principal Context；
- 显式 `isolateServices` capability 选择；
- `tenantIdOf(ctx)` / `principalOf(ctx)` contextual metadata；
- Cordis Fiber structural disposal；
- duplicate tenant graph 拒绝；
- cross-tenant principal binding 拒绝；
- two-tenant adversarial tests；
- packed external-consumer runtime smoke；
- 保留已经验证的 RC7 可执行兼容闭包，同时用当前上游 scope 行为校验架构方向。

退出条件：仓库完整 release gate 通过，packed package 能证明两个 Tenant 对同名 service 得到独立 provider，同时 ownership kernel 仍然共享。

## 🤝 R2 —— Provider Compatibility Contract

Context 只能隔离真正尊重 Context/service scope 的 provider。对真实 DSH provider 做 inventory，并分类：

1. **Context-safe** —— 可以直接实例化在 Tenant / Principal Context 下；
2. **需要修 scoped global-state** —— provider 使用 `ctx.root`、module singleton、global Map/Set、env 或其他 deployment-global identity；
3. **设计上就是 host-global** —— 不应该 tenant-local，应提供安全 tenant-facing facade。

在已审阅的当前上游里，第一个明确 gap 是 DSH MCP client 的 `serverName` reservation 按 `ctx.root` 全局管理。应推动最小 upstream/provider 修复，让 namespace ownership scope-aware，而不是 fork MCP runtime。

重点 capability family：

- Auth/session identity provider；
- MCP connection 与 credential；
- credential/token store；
- tenant config/secrets；
- 合适场景下的 storage/workspace adapter；
- 需要 tenant-local instance 的 model/provider policy。

## 🧭 R2.5 —— DSH Dependency Refresh

独立升级完整 DSH package graph 与 `pnpm-lock.yaml`，从当前已验证 RC7 闭包切到更新 release。不要把这类 dependency-resolution churn 混进 v0.2 架构 PR。

## 🤝 R3 —— Authenticated Transport → Context Binding

Production boundary 定义为：

```text
HTTP request / WebSocket connection
        ↓ authenticate
TenantPrincipal
        ↓ resolve/create
Tenant Context / Principal Context
        ↓
从该 Context 驱动 DSH 工作
```

能够由 Context 承载 dependency graph 的地方，不要再把 `tenantId` 参数扩散到每个 provider。Wire、durable、worker 与 authorization boundary 仍必须保留显式 identity。

需要证明：

- Tenant A/B 并发请求不 cross-talk；
- WebSocket lifetime 始终绑定正确 Principal Context；
- client field 不能选择可信 tenant/principal identity；
- session publication/lookup 仍通过 ownership kernel。

## 🧭 R4 —— Agent Integration

将 Tenant / Principal Context 与 DSH Agent creation 集成，但不能破坏现有 Agent/Preset scope-parent chain。

优先方向：

- 从 Tenant / Principal-derived Cordis Context 创建/驱动 Agent；
- DSH `agent.ctx` 继续负责 Agent-local registration lifecycle；
- Preset standing-scope ancestry 保持不变；
- 明确定义 Agent creation 继承哪些 tenant-scoped services。

## 🧭 R5 —— Production Providers

按真实需求拆成可替换 Plugin Family：

- durable ownership store（PostgreSQL/MySQL/Redis，按需求）；
- reference auth/context binder；
- tenant credential provider；
- 上游 namespace/global-state gap 解决后的 MCP tenant adapter；
- audit/usage provider。

不要让 core runtime 绑定某一套 SaaS 技术栈。

## ⛔ 明确边界

Cordis Context 不是 hostile-code sandbox，它不隔离：

- process memory/global；
- filesystem/shell；
- network；
- environment variable；
- 故意访问 `ctx.root` 或 process API 的 arbitrary plugin code。

要求 strong tenant isolation 的部署继续使用独立 process/container/Pod。Billing、组织 UI、general RBAC 与产品特定用户管理不属于本仓库 core contract。