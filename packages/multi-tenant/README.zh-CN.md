[English](./README.md) | 简体中文

# dsh-multi-tenant

面向 DeepSeek Harness（DSH）的多租户 SaaS 扩展：租户身份、会话所有权、授权边界、租户感知的 MCP，以及审计。

> **状态：早期开发 / 架构引导。** 本仓库只实现多租户**核心契约**。它**不是**完整的 SaaS 安全解决方案 —— 见 [这个核心不是什么](#这个核心不是什么)。

---

## 这个核心做什么

给定一个已认证的 `TenantPrincipal`，`dsh-multi-tenant` 通过一个默认拒绝、兼容持久存储的所有权契约，拥有并授权对不透明 DSH 会话 id 的访问。

具体而言，它提供两个 Cordis service —— `ctx.tenantSessionStore`（所有权存储 seam）与 `ctx.multiTenant`（所有权 + 授权）—— 二者共同：

- **抽象已认证主体**（`TenantPrincipal`），
- **拥有会话**，采用一次性认领、不可变的所有权，
- **无条件地强制租户边界**（任何角色都不可跨越），
- **默认拒绝式授权**（未知会话与外来会话都被拒绝），
- **定义存储 seam**（`TenantSessionStore`），使所有权持久化可以迁移到持久存储而不破坏 API。

## 这个核心不是什么

- ❌ 认证 / HTTP transport（无 JWT、cookies、web 登录）
- ❌ Transport 授权 / WebSocket 过滤 / `events.mux` / `events.host`
- ❌ MCP 客户端或租户感知的 MCP 凭据池
- ❌ 下游数据隔离 / ERP token
- ❌ 审计持久化
- ❌ UI / 计费 / 仪表盘
- ❌ RBAC / 角色-策略框架

这些都在[路线图](#路线图)上。核心是未来链条的中间一环：

```text
Authenticated Transport
        ↓
TenantPrincipal
        ↓
dsh-multi-tenant Core          ← 本仓库（Principal + Ownership + Authorization）
        ↓
Session ACL
        ↓
Tenant-aware MCP / business credentials
        ↓
Downstream tenant validation
```

## 架构

```text
Browser / SaaS client
        |
        | authenticated identity
        v
Tenant-aware connection / API boundary
        |
        | TenantPrincipal
        v
Session authorization
        |
        +---------------------+
        |                     |
        v                     v
Shared DeepSeek Harness   Tenant-aware MCP
Agent Loop / LLM / Tools  credential pool
        |
        v
Session persistence
        |
        v
Audit / usage store
```

## 设计原则

- **共享运行时，逻辑隔离** —— 一个 Harness 进程，多个租户，靠授权而非进程或 fork 分隔。
- **默认拒绝（fail closed）** —— 未知会话与未认证身份都被拒绝。
- **身份由服务端推导** —— `TenantPrincipal` 来自已认证边界，绝不来自客户端提供的字段。
- **一次性认领所有权** —— 会话的所有者不可变；冲突认领被拒绝，绝不被覆盖。
- **流是授权 surface** —— session、RPC、tool/MCP 流各自都是一个边界，而不仅是 HTTP 入口点。
- **纵深防御** —— 此核心只是一层；它不取代已认证边界或下游租户校验。
- **优先插件而非 fork** —— 构建在 DSH 公开的 plugin/service seam 之上。

## 安装

```sh
dsh plugin --profile web add github:GuoMonth/dsh-multi-tenant
```

该包声明了 [`dsh.bundle`](./package.json)，因此这会把它的 patch 层追加到 profile，并挂载 `ctx.tenantSessionStore` 与 `ctx.multiTenant` 两个 service。

## 核心 API

### 类型

```ts
interface TenantPrincipal {
  tenantId: string
  userId: string
  roles: readonly string[]
}

interface SessionOwner {
  tenantId: string
  userId: string
}
```

### `TenantSessionStore`（service seam，`ctx.tenantSessionStore`）

存储 seam 是一个 Cordis **Service**，而非普通接口：它由后端插件提供，并被 `MultiTenantService` 消费。`claim` 是**原子**的（单次操作，而非 get-then-set），以便持久后端将其映射为 `INSERT … ON CONFLICT`：

```ts
type ClaimResult = 'created' | 'idempotent' | 'conflict'

abstract class TenantSessionStore extends Service {
  claim(sessionId: string, owner: SessionOwner): Promise<ClaimResult>
  get(sessionId: string): Promise<SessionOwner | undefined>
}
```

v0 契约中**刻意没有 release/delete**：所有权是一次性认领且不可变。`InMemoryTenantSessionStore` 是默认提供方 —— 一个进程内 `Map`，仅供**开发/引导**，而非生产持久化。未来的持久后端通过替换 `tenantSessionStore` 提供方，无需改动 `MultiTenantService`。

### `MultiTenantService`（`ctx.multiTenant`）

消费 `ctx.tenantSessionStore`（经 `static inject` 声明）。所有方法都是 async，以便无需破坏性变更即可采用持久 store。

| 方法 | 语义 |
| --- | --- |
| `claimSession(sessionId, principal)` | 一次性认领。未认领 → 成功；同所有者 → 幂等；不同所有者 → `SessionOwnershipConflictError`。 |
| `getSessionOwner(sessionId)` | 面向可信方查询；返回所有者或 `undefined`。 |
| `canAccessSession(principal, sessionId)` | 默认拒绝式布尔。同租户 + 同所有者 → `true`；否则 `false`。 |
| `assertSessionAccess(principal, sessionId)` | 同上，但抛出统一的 `SessionAccessDeniedError`。 |

授权语义：

- **未知会话** → 拒绝。
- **租户不匹配** → 拒绝（无条件；先于其他一切检查）。
- **同租户、不同用户** → 拒绝（仅所有权；尚无 RBAC）。
- **同租户、同用户** → 允许。

标识符（`sessionId`、`tenantId`、`userId`）都是**不透明**的：核心绝不从会话 id 中解析租户 id，绝不使用基于前缀的授权，也绝不假设 UUID/数字形态 —— 只有不透明的精确匹配身份。

## 错误隐私

`assertSessionAccess` 抛出单一、不可枚举的 `SessionAccessDeniedError`（`"Access to session denied."`）。未知会话与外来会话不可区分，且错误绝不携带所有者的租户或用户 id。内部诊断原因（`UNKNOWN_SESSION`、`TENANT_MISMATCH`、`USER_MISMATCH`）仅为测试/审计/可观测性存在，不属于公开授权结果的一部分。

## 安全边界

Cordis / DSH 的 **scope** 是一种*组合与可见性*机制 —— service 隔离与依赖接线。它**本身**不是多租户安全边界。

生产部署必须跨层强制隔离：

```text
authenticated request boundary
        +
session ACL                          ← 本核心
        +
tenant-aware MCP / business token
        +
downstream ERP / business API tenant validation
```

不要把内存 store 或 Cordis scope 当作安全边界。

## 路线图

- [x] 项目引导
- [x] `TenantPrincipal` / `SessionOwner`
- [x] 一次性认领会话所有权
- [x] 默认拒绝式核心授权
- [x] `TenantSessionStore` seam（内存）
- [x] 运行时不变量的验证
- [x] Loader 集成测试
- [ ] 持久 `TenantSessionStore`（PostgreSQL / MySQL / Redis / 远程）
- [ ] HTTP principal/auth 集成
- [ ] 会话 RPC 授权
- [ ] WebSocket mux 过滤
- [ ] approval/question RPC 所有权
- [ ] 租户感知的 MCP
- [ ] token 用量 / 审计
- [ ] DSH Web 集成测试
- [ ] npm 预发布

## 开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

- `build` 运行 `tsdown`，产出 `dist/index.mjs` + `dist/index.d.mts`。
- `typecheck` 运行 `tsc --noEmit`。
- `test` 运行单元、安全，以及一个真实的 Cordis Loader 集成测试。

## 许可证

MIT
