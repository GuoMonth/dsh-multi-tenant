[English](./ROADMAP.md) | 简体中文

# 路线图

状态：✅ 已完成 · 🚧 下一步（已确定） · ⏳ 延后（由决策门控）。

## 路线图纪律

本路线图与实现遵循同一套边界规则：

- **控制得住 → 严格强制。** 只有当本仓库拥有可靠 enforcement point，并且可以用测试锁住不变量时，里程碑才承诺严格行为。
- **需要生态协作 → 制定标准。** 如果推进依赖 DSH / 第三方 seam，交付物是最小 contract、一致性要求或上游提案。路线图不会把一个生态依赖悄悄变成长期本地 fork。
- **控制不住 → 明确边界。** 当前无法强制的保证，写成 support / threat-model boundary 或延后。不要为了让 checklist 看起来更完整，就增加大型子系统。
- **快速跟进当前 DSH prerelease。** 当前目标是 **`0.1.0-rc.7`**。历史 RC6 证据继续作为 RC6 证据保留；版本推进时，只重新验证真正受影响的 seam，依赖这些结论的里程碑在 RC7 上重新形成证据之后再视为已证明。参见 `docs/reference/compatibility.md`。

## 已完成

- ✅ **内核核心** —— `TenantPrincipal` / `SessionOwner`、一次性认领所有权、默认拒绝式授权、`TenantSessionStore` service seam（内存提供方）。`packages/multi-tenant`。
- ✅ **Monorepo** —— pnpm 工作区含 `packages/`、共享 `tsconfig.base.json`、委托式根脚本、CI。
- ✅ **Web seam spike（M2）** —— Seam Map、可执行 facade 原型（6 条安全不变量）、以及收敛后的 web ADR。结论：Web 强制仍受 transport principal 绑定问题（H3 假设）约束。
- ✅ **内核工程脚手架** —— `TenantSessionStore` 契约套件（`dsh-multi-tenant/testing`）、架构门（`pnpm verify`）、包冒烟（`pnpm smoke`）、兼容性政策（`docs/reference/compatibility.md`）。
- ✅ **架构收敛（M3）** —— 六层架构（`docs/specs/architecture.md`）、Agent `setup` 钩子被确认为准入点，并把「H3-only」确立为**假设**，由 M4 的真实 transport 证据最终验证。

## 下一步（已确定）

- 🚧 **M4 — 真实集成证明。** 在提交上游提案*之前*，用真实 DSH runtime 演示 M3 的结论。已有 RC6 proof 继续作为历史证据保留；对当前 RC7 目标只做受影响 seam 的定向复验，而不是重新设计没有变化的层：
  1. **准入装饰器** ✅ —— 真实 `AgentService`，覆盖 create / fork / subagent / resume，准入在 `setup` 内、先于 `sessions.enter`。
  2. **真实 `ApiProxy` facade** ✅ —— spike 的 `ApiSurface` 已删除；真实 `RpcMethodMap` 在编译期穷举分类。v0 安全策略默认拒绝：session point 做 GUARD，仅 `session.list` 做 FILTER，`session.create` 归类为 ADMIT（admission bridge 安装前直接拒绝），search / host-global / deployment-management surface 在缺少 tenant-safe 语义前均 DENY。流 / `respond` / `downloads` 在 ②-C 前继续拒绝。
  3. **真实 transport 原型** —— 对真实 runtime 跑 HTTP / WS / respond / mux / host（仍用 `X-Test-Tenant` / `X-Test-User`），锁死租户隔离不变量、`rpcId → sessionId` respond correlation 与无遗漏的安装顺序。
- 🚧 **M5 — 上游提案 + Web 强制。** 只提交 M4 实际证明为必要的 request/connection-scoped principal seam（以及任何其他被真实证据暴露出的 seam），然后在其上构建完整强制。缺少上游 seam 是生态协作点，不是把整套 transport 吸收到本仓库里的理由。

## 延后（由决策门控）

- ⏳ **H2 — 资源模型。** Workspace 与 host-global frame 是否由租户拥有。产品决策；在此之前，v0 拒绝非 session 的 host frame。
- ⏳ **租户作用域搜索。** 当前 `session.search` 是全局排序/限量；在 visibility predicate / scoped candidate set 能保证正确搜索语义前保持拒绝。
- ⏳ **认证提供方**（JWT / OIDC / API key）。在 H3 之后；`TenantPrincipalResolver` 的落点仍待定。
- ⏳ **持久存储**（PostgreSQL / Redis / MySQL）。一旦一个独立的组合 / 替换 / 依赖 / 生命周期边界被证明，就创建一个提供方包。
- ⏳ **`dsh-multi-tenant-web` 的公共契约冻结**（在 H3 解决之前，其名字与 surface 都是临时的）。
- ⏳ 租户感知的 MCP、审计/用量、计费/UI。

## 里程碑

- **M0 — 工程地基** ✅ monorepo、包规则、规格/ADR 纪律、CI。
- **M1 — 内核加固** ✅ 契约测试脚手架、架构门、包冒烟、兼容性政策。
- **M2 — 会话创生 spike** ✅ 确认 `setup` 钩子为准入点；fork / subagent / resume 今天即可解决。
- **M3 — 架构收敛** ✅ 六层架构 + H3-only 作为假设。
- **M4 — 真实集成证明** 🚧 准入装饰器与真实 unary `ApiProxy` 已证明；真实 HTTP/WS transport 待完成。
- **M5 — 上游提案 + Web 强制。**
- **M6 — 提供方** 持久存储、认证。
- **M7 — MCP / audit / 全栈 preset。**
- **M8 — 端到端租户隔离套件** —— 对**支持栈中实际覆盖的 surface**执行的「皇冠」测试。它证明被覆盖的隔离链；任何未支持 / 属于生态的 surface 都必须明确列成边界，而不是声称测试无法执行的保证。

每个里程碑由其前驱的决策门控；上表延后项仅当其门（一个决策或一个上游 seam）闭合时才会被提前。
