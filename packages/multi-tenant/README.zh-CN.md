[English](./README.md) | 简体中文

# dsh-multi-tenant

面向 DeepSeek Harness（DSH）的 Context-native 多租户 Runtime 原语。

> **v0.2 版本线：** `0.2.0-rc.1` 将项目从“授权 Kernel”提升为“真正的 Multi-Tenant Runtime”。已经发布的 v0.1 tag 作为历史契约冻结：不可变 session ownership + fail-closed authorization。v0.2 保留这层 Kernel，并新增 Tenant / Principal 的 Cordis capability scope。
>
> 本 PR 的可执行 DSH compatibility target 保持仓库已经验证的 `0.1.0-rc.7` 依赖闭包；设计阶段已审阅当前上游 `0.1.1-rc.2` 的 scope 行为，完整依赖/lockfile 升级单独处理。

## Supported guarantee

v0.2 有两层保证：

1. **Context-native capability isolation** —— `ctx.tenantRuntime` 创建真实 Cordis child lifecycle；显式指定的 service name 获得 tenant-local、以及可选的 principal-local isolation label。Tenant Provider 挂在对应 Context 下，不再额外发明一套 `tenantId -> service` 容器。
2. **Persistent ownership authorization** —— v0.1 的 `ctx.multiTenant` 保持 deployment-global，继续对 `(tenantId, userId)` session ownership 做不可变、fail-closed 的持久安全校验。

Ownership Kernel 继续保证：

- claim-once、不可变 ownership；
- cross-tenant 永远拒绝；
- v0.x 同用户 ownership；
- unknown / foreign session fail closed；
- public denial 不可枚举；
- 可替换的 async `TenantSessionStore` seam。

Runtime 新增保证：

- 一个 `TenantRuntimeService` 内，同 tenantId 只能存在一个 canonical live capability graph；
- Tenant / Principal identity 精确绑定到返回的 Context；
- 显式隔离的 service 在 Tenant Context 中独立解析；
- 显式隔离的 service 在 Principal Context 中可再独立一层；
- ownership kernel、runtime manager 与 Cordis core service 禁止被错误隔离；
- Tenant / Principal 生命周期沿 Cordis Fiber dispose。

## Context-native runtime

v0.2 直接使用 Cordis 作为 scope system，而不是在 Cordis 里面重新实现一套 dependency container。

```ts
const acme = ctx.tenantRuntime.createTenant('acme', {
  isolateServices: ['tenantAuth', 'tenantMcp'],
})

await acme.ctx.plugin(authProvider, acmeAuthConfig)
await acme.ctx.plugin(mcpProvider, acmeMcpConfig)

const alice = acme.createPrincipal(
  { tenantId: 'acme', userId: 'alice' },
  { isolateServices: ['userCredentials'] },
)

await alice.ctx.plugin(credentialsProvider, aliceCredentials)
```

概念结构：

```text
Deployment / Root Context
│
├── shared ownership kernel (ctx.multiTenant)
├── shared durable ownership store
│
├── Tenant A Context
│   ├── tenant-local auth / MCP / providers
│   └── Principal Alice Context
│       └── user-local credentials
│
└── Tenant B Context
    ├── tenant-local auth / MCP / providers
    └── Principal Bob Context
        └── user-local credentials
```

`tenantIdOf(ctx)` / `principalOf(ctx)` 给可信的同进程插件读取当前 Context identity。它们只用于 routing / composition，**不是授权结果**；持久/session 边界仍然必须调用 `ctx.multiTenant`。

### 两套 scope plane 刻意分开

DSH 已经用 `@deepseek-ai/dsh-scope` 管 Agent / Preset registration visibility。v0.2 不把 Tenant 强行塞进这条 parent chain，因为 Agent Preset 已经使用 Agent scope parent relation。

- **Cordis service isolation**：Tenant / Principal capability provider；
- **DSH scope chain**：Agent / Preset 的 tools、prompt contribution、listener 等 registration view。

二者分开，避免争抢 parent binding，也避免把 capability authority 和 model-facing registration visibility 混成一个概念。

## Core APIs

### `ctx.tenantRuntime`

```ts
interface TenantScopeOptions {
  isolateServices?: readonly string[]
}

interface PrincipalScopeOptions {
  isolateServices?: readonly string[]
}

ctx.tenantRuntime.createTenant(tenantId, options)
ctx.tenantRuntime.get(tenantId)
```

同一个 tenantId 不能同时创建两套 live runtime；必须先 dispose 再重新创建。

### `ctx.multiTenant`

v0.1 Kernel API 保持：

```ts
interface TenantPrincipal {
  tenantId: string
  userId: string
}

ctx.multiTenant.claimSession(sessionId, principal)
ctx.multiTenant.canAccessSession(principal, sessionId)
ctx.multiTenant.assertSessionAccess(principal, sessionId)
```

## Explicit boundaries

这个 package **不是** process/container sandbox。Cordis Context 隔离的是 service resolution 与 lifecycle，不会隔离同进程任意代码。可信插件仍然可以访问 process global、filesystem、network、environment variable，也可以故意访问 `ctx.root`。

强 process/filesystem/network/shell isolation 仍应由 deployment boundary 负责，例如 one tenant per container / Pod。

v0.2 RC1 也**不声称现有每一个 DSH 插件自动具备 tenant-awareness**。Provider 必须允许在 Tenant Context 下实例化。已审阅的当前上游有一个明确例子：DSH MCP client 的 `serverName` reservation 仍按 `ctx.root` 全局管理，因此不同 Tenant 使用相同 `serverName` 时仍需要上游/provider 改造或显式使用不同名称。这是 ecosystem compatibility gap，不应该通过我们再造一个 registry 去掩盖。

本 package 也不负责 billing、组织 UI、general RBAC 或完整 HTTP/WebSocket authentication transport。外部认证边界需要先选择/创建正确的 Tenant / Principal Context，再驱动 DSH 工作。

## 安装

Prerelease 使用 `next` dist-tag：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

Bundle 会加载三条 deployment-global service：

- `ctx.tenantSessionStore` —— 内存参考 provider；
- `ctx.multiTenant` —— ownership / authorization kernel；
- `ctx.tenantRuntime` —— context-native tenant runtime manager。

Production 应替换内存 ownership store 为 durable provider。

## 发布验证

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

Release gate 覆盖 package invariant、typecheck、unit / contract tests、packed external-consumer smoke 与锁定版本的 DSH runtime probes。

## License

MIT