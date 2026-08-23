[English](./README.md) | 简体中文

# dsh-multi-tenant

目标：让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）真正成为 **Multi-Tenant Runtime**，同时保留一个小而可审计的安全 Kernel。

> **当前版本线：`0.2.0-rc.1`。** 已发布的 v0.1 tag 冻结为历史契约。v0.1 负责不可变 session ownership 与 fail-closed authorization；v0.2 在其上增加 Context-native Tenant / Principal capability scope。本 PR 的可执行 DSH compatibility closure 保持已经验证的 **`0.1.0-rc.7`**；设计阶段另外审阅了当前上游 `0.1.1-rc.2` 的 scope 行为。

## 架构

```text
Deployment / Root Context
│
├── shared TenantSessionStore
├── shared MultiTenantService        <- 持久授权 invariant
├── shared TenantRuntimeService
│
├── Tenant A Cordis Context          <- capability graph
│   ├── tenant-local auth / MCP / providers
│   └── Principal A Context
│       └── user-local credentials
│
└── Tenant B Cordis Context
    ├── tenant-local auth / MCP / providers
    └── Principal B Context
        └── user-local credentials
```

项目刻意区分三层隔离：

1. **Ownership Kernel** —— 持久 `(tenantId, userId) -> session` 授权，fail closed；
2. **Cordis Context Isolation** —— Tenant / Principal service resolution 与 plugin lifecycle；
3. **Deployment Isolation** —— process/filesystem/network/shell；需要强隔离时使用 one tenant per container / Pod。

DSH 自己的 `@deepseek-ai/dsh-scope` 继续负责 Agent / Preset registration visibility。Tenant capability isolation 使用 Cordis service isolation，不去争抢 Agent scope 的 parent chain。

## v0.1 冻结

已经发布的 v0.1 tag 保持不变，继续表示原来的 Kernel contract：

- 最小 authenticated `TenantPrincipal`；
- claim-once immutable session ownership；
- fail-closed access decision；
- 可替换 `TenantSessionStore` provider seam。

v0.1 不再增加新功能；这些保证作为 defense in depth 被完整保留进 v0.2。

## v0.2 Runtime

`ctx.tenantRuntime` 创建真实 Cordis Tenant / Principal child lifecycle。显式选择的 service name 获得独立 isolation label，因此 Tenant A / Tenant B 下挂载的 provider 由 Cordis 原生解析，不需要再造一套应用级 `tenantId -> service` 容器。

Runtime 保持 provider-neutral：auth、MCP、credential、storage、model 等 provider 通过挂载到正确 Context 下进入租户体系，同时 provider 自身不能绕开 Cordis resolution 使用 deployment-global state。

上游/provider 的 gap 会明确记录，不会被第二套 registry 掩盖。例如在已审阅的当前上游里，DSH MCP client 的 `serverName` reservation 仍按 `ctx.root` 全局管理，所以不同 Tenant 复用同一个 serverName 目前还不能自动视为安全。

## 原则

- **控制得住 → 严格强制**：仓库拥有的边界做 fail-closed invariant；
- **需要生态协作 → 制定标准**：优先使用 Cordis / DSH 原生 scope，缺 seam 时只推动最小上游 contract；
- **控制不住 → 明确边界**：Context 不是 process sandbox；
- **不再造 DI 容器**：Tenant capability resolution 属于 Cordis Context；
- **Defense in depth**：Context routing 永远不能替代持久 session ownership 校验。

## Packages

| Package | Distribution | Role |
| --- | --- | --- |
| [`packages/multi-tenant`](./packages/multi-tenant) | npm `dsh-multi-tenant@next` | v0.2 runtime + 冻结的 v0.1 ownership kernel：`ctx.tenantRuntime`、`ctx.multiTenant`、`ctx.tenantSessionStore`。 |
| [`packages/multi-tenant-web`](./packages/multi-tenant-web) | private workspace | Web/API enforcement 实验；production transport 仍需要真实 authenticated principal/context binding。 |

参见 [ROADMAP.zh-CN.md](./ROADMAP.zh-CN.md)、[`docs/releases/v0.2.0-rc.1.md`](./docs/releases/v0.2.0-rc.1.md) 与 [CONTRIBUTING.zh-CN.md](./CONTRIBUTING.zh-CN.md)。

## 开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

完整 release gate：

```sh
pnpm release:check
```

## License

MIT