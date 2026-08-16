[English](./ROADMAP.md) | 简体中文

# 路线图

状态：✅ 已完成 · 🚧 下一步（已确定） · ⏳ 延后（由决策门控）。

## 已完成

- ✅ **内核核心** —— `TenantPrincipal` / `SessionOwner`、一次性认领所有权、默认拒绝式授权、`TenantSessionStore` service seam（内存提供方）。`packages/multi-tenant`。
- ✅ **Monorepo** —— pnpm 工作区含 `packages/`、共享 `tsconfig.base.json`、委托式根脚本、CI。
- ✅ **Web seam spike** —— Seam Map、可执行 facade 原型（6 条安全不变量）、以及 `packages/multi-tenant-web` 中的 ADR。结论：web 强制被一个上游 per-connection seam（H3）所阻塞。
- ✅ **内核工程脚手架** —— `TenantSessionStore` 契约套件（`dsh-multi-tenant/testing`）、架构门（`pnpm verify`）、包冒烟（`pnpm smoke`）、兼容性政策（`docs/reference/compatibility.md`）。

## 下一步（已确定）

- 🚧 **H3 上游提案** —— 针对 `deepseek-ai/deepseek-harness` 提交 request/connection-scoped principal seam（唯一剩余的上游缺口），然后构建强制（`ctx.agents` 装饰器 + `ApiProxy` facade）。

## 延后（由决策门控）

- ⏳ **H2 — 资源模型。** Workspace 与 host-global frame 是否由租户拥有。产品决策；在此之前，v0 拒绝非 session 的 host frame。
- ⏳ **认证提供方**（JWT / OIDC / API key）。在 H3 之后；`TenantPrincipalResolver` 的落点仍待定。
- ⏳ **持久存储**（PostgreSQL / Redis / MySQL）。一旦一个独立的组合 / 替换 / 依赖 / 生命周期边界被证明，就创建一个提供方包。
- ⏳ **`dsh-multi-tenant-web` 的公共契约冻结**（在 H3 解决之前，其名字与 surface 都是临时的）。
- ⏳ 租户感知的 MCP、审计/用量、计费/UI。

## 里程碑

- **M0 — 工程地基** ✅ monorepo、包规则、规格/ADR 纪律、CI。
- **M1 — 内核加固** ✅ 契约测试脚手架、架构门、包冒烟、兼容性政策。
- **M2 — 会话创生 spike** ✅ 确认 `setup` 钩子为准入点；H3-only 上游提案（fork / subagent / resume 今天即可解决）。
- **M3 — 真实 web seam spike v2** ✅ 收敛：H3-only 上游 seam（request-scoped principal）；强制可通过 `ctx.agents` 装饰器 + `ApiProxy` facade 解决。
- **M4 — Web 强制。**
- **M5 — 提供方** 持久存储、认证。
- **M6 — MCP / audit / 全栈 preset。**

每个里程碑由其前驱的决策门控；上表延后项仅当其门（一个决策或一个上游 seam）闭合时才会被提前。
