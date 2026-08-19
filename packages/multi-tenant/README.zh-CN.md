[English](./README.md) | 简体中文

# dsh-multi-tenant

面向 DeepSeek Harness（DSH）的多租户 kernel 原语：tenant identity、不可变 session ownership、fail-closed authorization，以及可替换的 ownership-store contract。

> **Release candidate：`0.1.0-rc.1`。** 这个 package 刻意保持小而明确。它是第一次 0.1 版本线中**唯一可发布的 artifact**；Web/auth/MCP/runtime isolation 属于独立 integration 或生态问题。当前 DSH compatibility target 为 `0.1.0-rc.7`。

## 支持的保证

给定一个已认证的 `TenantPrincipal`，这个 package 通过 fail-closed ownership contract 拥有并授权对不透明 DSH session id 的访问。

它提供两个 Cordis service：

- `ctx.tenantSessionStore` —— 可替换 ownership storage seam；
- `ctx.multiTenant` —— claim-once ownership 与 authorization。

Kernel 保证：

- **claim-once、不可变 ownership**；
- **无条件 tenant boundary** —— 任何 role 都不能跨 tenant；
- **v0.1 同用户 ownership** —— 同 tenant、不同 user 仍拒绝；
- **fail-closed authorization** —— unknown / foreign session 都拒绝；
- **不可枚举的公开 denial** —— 不暴露 unknown 与 foreign 的区别；
- **async storage contract** —— durable provider 可以替换内存参考实现，而无需改变 kernel API。

## 明确边界

这个 package **不是**：

- authentication 或 HTTP/WebSocket transport 层；
- production 多用户 DSH Web integration；
- durable database provider（内置内存 provider 只用于 bootstrap/dev）；
- MCP credential/context 实现；
- audit/usage store；
- process、shell、filesystem、container、credential 或 network isolation；
- billing、UI、组织/用户管理或通用 RBAC framework；
- team sharing / ACL / reassignment model。

这些东西并不都是“未来 kernel feature”。项目规则是：**控制得住 → 严格强制；需要生态协作 → 制定标准；控制不住 → 明确边界。**

## Core API

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

### `TenantSessionStore`（`ctx.tenantSessionStore`）

Storage seam 是一个 Cordis `Service`。`claim` 是一个原子的 contract 操作，使 durable provider 可以映射到自身的 conditional-write primitive。

```ts
type ClaimResult = 'created' | 'idempotent' | 'conflict'

abstract class TenantSessionStore extends Service {
  claim(sessionId: string, owner: SessionOwner): Promise<ClaimResult>
  get(sessionId: string): Promise<SessionOwner | undefined>
}
```

0.1 contract 中刻意没有 release/reassign API。Ownership 不可变。`InMemoryTenantSessionStore` 是参考 provider，只用于测试/bootstrap，不提供 production durability。

第三方 provider 应运行 `dsh-multi-tenant/testing` 导出的共享 contract suite。

### `MultiTenantService`（`ctx.multiTenant`）

| 方法 | 语义 |
| --- | --- |
| `claimSession(sessionId, principal)` | 未认领 → 创建；同 owner → 幂等；其他 owner → conflict。 |
| `getSessionOwner(sessionId)` | 面向可信方的 owner lookup。 |
| `canAccessSession(principal, sessionId)` | fail-closed 布尔授权。 |
| `assertSessionAccess(principal, sessionId)` | 同一策略，拒绝时抛统一 `SessionAccessDeniedError`。 |

授权基于 opaque exact-match：kernel 不从 session id 里解析 tenant identity，也不使用前缀做授权。

## 错误隐私

`assertSessionAccess` 只暴露一个不可枚举的 denial。unknown session 与 foreign session 对调用方刻意不可区分；公开错误中永远不携带 owner tenant/user identity。

## 安装 / 组合

第一次 npm prerelease 使用 **`next`** dist-tag，而不是 `latest`。R3 发布以后，可安装到 DSH profile：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

Package 声明了 `dsh.bundle`，因此 DSH 会把它的 bundle layer 加入 profile。内置 layer 会挂载内存 `tenantSessionStore` 参考实现与 `multiTenant` service。需要 durability 的 deployment 应替换 store provider，而不是修改 kernel。

## 发布验证

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` 覆盖 package/architecture invariant、release-manifest preflight、typecheck、unit/contract test、build、真实 packed external-consumer smoke，以及 RC7 DSH runtime proof。详细见 [`docs/reference/release.zh-CN.md`](../../docs/reference/release.zh-CN.md)。

Production Web principal binding、durable provider、auth provider、search、MCP、audit 与 deployment recipe 都是独立 follow-up。参见 [`ROADMAP.md`](../../ROADMAP.md)。

## 开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## 许可证

MIT
