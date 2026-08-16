[English](./ROADMAP.md) | 简体中文

# 路线图

状态：✅ 已完成 · 🚧 下一步（已确定） · ⏳ 延后（由决策门控）。

## 已完成

- ✅ **内核核心** —— `TenantPrincipal` / `SessionOwner`、一次性认领所有权、默认拒绝式授权、`TenantSessionStore` service seam（内存提供方）。`packages/multi-tenant`。
- ✅ **Monorepo** —— pnpm 工作区含 `packages/`、共享 `tsconfig.base.json`、委托式根脚本、CI。
- ✅ **Web seam spike（M2）** —— Seam Map、可执行 facade 原型（6 条安全不变量）、以及收敛后的 web ADR。结论：web 强制被一个上游 per-connection seam（H3）所阻塞。
- ✅ **内核工程脚手架** —— `TenantSessionStore` 契约套件（`dsh-multi-tenant/testing`）、架构门（`pnpm verify`）、包冒烟（`pnpm smoke`）、兼容性政策（`docs/reference/compatibility.md`）。
- ✅ **架构收敛（M3）** —— 六层架构（`docs/specs/architecture.md`）、Agent `setup` 钩子被确认为准入点，并把「H3-only」确立为**假设**：强制通过 `ctx.agents` 装饰器 + `ApiProxy` facade 是*静态*可解的。**运行时证明被推迟到 M4** —— 静态结论尚未在真实 DSH runtime 上得到演示。

## 下一步（已确定）

- 🚧 **M4 — 真实集成证明。** 在提交上游提案*之前*，用真实 DSH runtime 演示 M3 的结论：
  1. **准入装饰器** ✅ —— 包装真实的 `AgentService`；断言准入在 `setup` 内、先于 `sessions.enter` 执行，覆盖 create / fork / subagent / resume。已由 `scripts/admission-decorator-probe.mjs`（`docs/specs/admission-composition.md` §5）证明：装饰器能加入每一次 `setup`，且准入在四条路径上都先于可见 —— 无需新的准入 seam。
  2. **真实 `ApiProxy` facade** —— 删掉 spike 的 `ApiSurface`；对真实 `@deepseek-ai/dsh-host-apiproxy` surface 做穷举分类（ALLOW / GUARD / FILTER / DENY），使新增的 DSH 方法**编译失败**，而非默默通过。
  3. **真实 transport 原型** —— 对真实 runtime 跑 HTTP / WS / respond / mux / host（仍用 `X-Test-Tenant` / `X-Test-User`），锁死六条租户隔离不变量。
- 🚧 **M5 — 上游提案 + Web 强制。** 提交 request/connection-scoped principal seam（以及 M4 暴露的任何其他 seam），然后在其上构建强制。

## 延后（由决策门控）

- ⏳ **H2 — 资源模型。** Workspace 与 host-global frame 是否由租户拥有。产品决策；在此之前，v0 拒绝非 session 的 host frame。
- ⏳ **认证提供方**（JWT / OIDC / API key）。在 H3 之后；`TenantPrincipalResolver` 的落点仍待定。
- ⏳ **持久存储**（PostgreSQL / Redis / MySQL）。一旦一个独立的组合 / 替换 / 依赖 / 生命周期边界被证明，就创建一个提供方包。
- ⏳ **`dsh-multi-tenant-web` 的公共契约冻结**（在 H3 解决之前，其名字与 surface 都是临时的）。
- ⏳ 租户感知的 MCP、审计/用量、计费/UI。

## 里程碑

- **M0 — 工程地基** ✅ monorepo、包规则、规格/ADR 纪律、CI。
- **M1 — 内核加固** ✅ 契约测试脚手架、架构门、包冒烟、兼容性政策。
- **M2 — 会话创生 spike** ✅ 确认 `setup` 钩子为准入点；fork / subagent / resume 今天即可解决。
- **M3 — 架构收敛** ✅ *仅静态*：六层架构、H3-only 作为假设；强制通过 `ctx.agents` 装饰器 + `ApiProxy` facade 静态可解。
- **M4 — 真实集成证明** 🚧 准入装饰器、真实 `ApiProxy` facade + 穷举分类、真实 HTTP/WS transport 原型。
- **M5 — 上游提案 + Web 强制。**
- **M6 — 提供方** 持久存储、认证。
- **M7 — MCP / audit / 全栈 preset。**
- **M8 — 端到端租户隔离套件** —— 可执行的「皇冠」：证明租户 A 跨 auth → HTTP/WS → ApiProxy → session → agent → MCP → storage 绝不触及租户 B。

每个里程碑由其前驱的决策门控；上表延后项仅当其门（一个决策或一个上游 seam）闭合时才会被提前。
