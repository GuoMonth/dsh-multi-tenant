[English](./README.md) | 简体中文

# dsh-multi-tenant

目标：让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）真正成为 **Multi-Tenant Runtime**，同时保留一个小而可审计的安全 Kernel。

> **当前版本线：`0.2.0-rc.2`。** 已发布的 v0.1 tag 冻结为历史契约。v0.1 负责不可变 session ownership 与 fail-closed authorization；v0.2 在其上建立 canonical Tenant / Principal runtime tree，为后续 SaaS Framework 提供稳定地基。

## 架构

```text
Deployment / Root
│
├── shared TenantSessionStore
├── shared MultiTenantService          持久授权 invariant
├── shared TenantRuntimeService
│
├── Tenant(acme)                       canonical runtime node
│   ├── tenant capability graph
│   ├── Principal(alice)               canonical runtime node
│   │   └── principal capability graph
│   └── Principal(bob)
│
└── Tenant(globex)
```

项目刻意区分四个 plane：

1. **Persistent Authorization** —— 持久 `(tenantId, userId) -> session` ownership，始终 fail closed；
2. **Tenant / Principal Capability Graph** —— Cordis Context service isolation 与 lifecycle；
3. **Agent / Preset Registration Graph** —— DSH `@deepseek-ai/dsh-scope`，负责 tools、prompt、listeners 与 Agent-local visibility；
4. **Strong Deployment Isolation** —— process/filesystem/network/shell，要求强隔离时使用独立 container / Pod。

Capability authority 与 Agent registration visibility 是两个不同的数据结构。Principal Context 是 `ctx.agents.create()` 的 owner / composition boundary；Agent 所需能力通过 setup 显式 projection / composition，而不是假装 `Agent.ctx` 直接继承 Tenant service graph。

## v0.1 冻结

已发布的 v0.1 继续表示 security kernel：

- 最小 authenticated `TenantPrincipal`；
- claim-once immutable session ownership；
- fail-closed access decision；
- 可替换 `TenantSessionStore` provider seam。

这些保证作为 defense in depth 完整保留在 v0.2，并保持 deployment-global。

## v0.2 Runtime Contract

Tenant 和 Principal 使用统一结构：

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinition)
const alice = await tenant.principals.ensure('alice', principalDefinition)
```

两级节点都有 immutable identity、scoped Context、`state`、幂等 `dispose()`，以及统一的 `ensure / get` canonical registry。

创建过程是 transaction：

```text
reserve canonical key
        ↓
unpublished Cordis subtree
        ↓
await setup
        ↓
optional synchronous commit()
        ↓
publish active node
```

因此半初始化 Tenant / Principal 不会暴露。并发 `ensure()` single-flight；setup 失败完整 rollback；active definition drift 明确失败；Tenant teardown 先 drain Principals 再回收自己。

Principal registry 直接嵌套在 Tenant 下，所以 key 只需要 `userId`，`tenantId` 从父结构中自然获得——错误 tenantId 这种非法状态从数据结构层面就不存在。

## Provider Ecosystem

`dsh-multi-tenant/testing` 提供可执行 Tenant-Safe Provider Contract。第三方 provider 可以自动证明：同名 A/B service 隔离、root/parent 不泄漏、descendant inheritance、sibling 不干扰、dispose isolation，以及 recreate 不残留旧状态。

这就是未来 Plugin Family 的基础：SaaS Distribution 可以提供 opinionated defaults，但每个 capability slot 都允许被满足同一 contract 的实现替换。

## 工程原则

- **控制得住 → 严格强制**：仓库拥有的边界做 fail-closed invariant；
- **需要生态协作 → 制定标准**：优先定义可执行 provider / transport contract，而不是把所有实现都塞进 core；
- **控制不住 → 明确边界**：Cordis Context 不是 hostile-code / process sandbox；
- **结构优先于补丁**：通过 ownership/data structure 让非法状态无法表达；
- **Prerelease 不背兼容债务**：更好的长期抽象出现时可以直接破坏性重构；
- **不再造 DI 容器**：capability resolution 属于 Cordis Context。

## Packages

| Package | Distribution | Role |
| --- | --- | --- |
| [`packages/multi-tenant`](./packages/multi-tenant) | npm `dsh-multi-tenant@next` | v0.2 Runtime Contract + 冻结的 v0.1 ownership kernel：`ctx.tenantRuntime`、`ctx.multiTenant`、`ctx.tenantSessionStore`。 |
| [`packages/multi-tenant-web`](./packages/multi-tenant-web) | private workspace | Web/API enforcement 实验；产品级 transport composition 进入 SaaS Framework 阶段。 |

参见 [ROADMAP.zh-CN.md](./ROADMAP.zh-CN.md)、[`docs/releases/v0.2.0-rc.2.md`](./docs/releases/v0.2.0-rc.2.md) 与 [CONTRIBUTING.zh-CN.md](./CONTRIBUTING.zh-CN.md)。

## 开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm release:check
```

## License

MIT
