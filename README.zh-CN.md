[English](./README.md) | 简体中文

# dsh-multi-tenant

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）真正成为 **Multi-Tenant Runtime**，同时保留一个小而可审计的安全 Kernel。

> **当前版本线：`0.2.0-rc.3`。** v0.1 是冻结的 ownership / authorization Kernel；v0.2 是 canonical Tenant / Principal Runtime Contract。后续 SaaS Framework 应该组合它，而不是重新发明 Runtime。
>
> **当前 DSH compatibility baseline：** `0.1.1-rc.2`，上游 release commit 为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。版本与 commit 都显式固定，由我们手动推进；CI 永远不追 floating `latest` 或 `master`。

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

项目刻意拆成四个 plane，而不是让一个“tenant 机制”承担所有职责：

1. **Persistent authorization** —— durable `(tenantId, userId) -> session` ownership，始终 fail closed；
2. **Tenant / Principal capability graph** —— Cordis Context service isolation 与 lifecycle；
3. **Agent / Preset registration graph** —— DSH `@deepseek-ai/dsh-scope`，负责 tools、prompt、listener 和 Agent-local visibility；
4. **Strong deployment isolation** —— process/filesystem/network/shell；需要时采用 one tenant per container / Pod。

Canonical Principal Context 是 capability / composition root。需要额外 service 的具体操作，应在 Principal 派生的 integration fiber 中显式 Cordis inject。Agent creation 的结构是：

```text
Principal Runtime
      ↓
Principal-derived integration fiber
  inject: agents
      ↓
ownerCtx.agents.create(...)
      ↓
DSH Agent setup / Agent scope
```

这样不会把两套 scope plane 强行揉在一起，也不会假装 `Agent.ctx` 直接继承 Tenant service-isolation graph。

## v0.1 冻结

已发布的 v0.1 继续表示安全 Kernel：

- 最小 authenticated `TenantPrincipal`；
- claim-once immutable session ownership；
- fail-closed access decision；
- 可替换 `TenantSessionStore` provider seam。

这些保证在 v0.2 内保持 deployment-global，作为 defense in depth。

## v0.2 Runtime Contract

Tenant 和 Principal 使用同一套结构语义：

```ts
const tenant = await ctx.tenantRuntime.tenants.ensure('acme', tenantDefinition)
const alice = await tenant.principals.ensure('alice', principalDefinition)
```

两级都是 canonical runtime node：拥有 immutable identity、scoped Context、显式 lifecycle state、幂等 quiescent disposal，以及 canonical `ensure/get` registry。

创建过程是事务化的：

```text
reserve canonical identity
        ↓
prepare unpublished Cordis subtree
        ↓
await setup(signal)
        ↓
optional synchronous commit()
        ↓
publish active node
```

Preparing transaction 本身也是 first-class lifecycle resource。Registry teardown 先关闭 admission，再取消未发布 creation，最后 drain 已发布 scope。半初始化 graph 不可见；并发 `ensure()` single-flight；setup 失败完整 rollback；definition drift 明确失败。

## Provider 生态

`dsh-multi-tenant/testing` 提供可执行的 Runtime Capability Provider Contract。Provider 作者可以验证：同名 A/B isolation、root/parent 不泄漏、descendant inheritance、sibling 不干扰、dispose isolation、clean recreation、以及 unpublished setup ownership。

这套 contract 是未来 Plugin Family 的地基：SaaS Framework 可以提供 opinionated defaults，但每个 capability slot 仍然可以被替换。

## 工程原则

- **Structure before patches** —— 先设计 ownership、数据结构、状态流转，让正确行为自然长出来；
- **Strong semantic types** —— 用 TypeScript 类型系统 / 泛型表达 identity 与 lifecycle 语义，避免松散字段拼接；
- **相关性优先于“正确性展示”** —— 技术上正确的实验，如果已经不服务于当前架构，就不继续占据 live tree；
- **控制得住 -> 严格强制** —— 仓库拥有的边界 fail closed；
- **需要生态协作 -> 制定标准** —— 用可执行 provider / integration contract，而不是把所有实现塞进 core；
- **控制不住 -> 明确边界** —— Cordis Context 不是 hostile-code / process sandbox；
- **Prerelease 不背兼容债** —— 更好的长期抽象出现时，直接破坏早期 API；
- **不再造第二套 DI** —— capability resolution 属于 Cordis Context。

## Compatibility Evidence

CI 只证明当前架构真正依赖的 DSH seam：

- checkout 精确上游 DSH release commit，并验证 root package version；
- 证明 session publication / rollback 语义；
- 对精确发布包证明 Principal-derived Agent owner/context composition。

历史 Web/ApiProxy 与全局 admission-decorator 实验继续存在于 Git history，但不再作为 live package 或 blocking evidence。

## 当前 Package

[`packages/multi-tenant`](./packages/multi-tenant) 是当前唯一 live workspace package，通过 npm `dsh-multi-tenant`（`latest`）发布，包含 v0.2 Runtime Contract 与冻结的 v0.1 ownership kernel。

v0.3 不会提前创建 package 名称或 scaffold。Auth、Transport、Credentials、MCP、各类 provider 与 SaaS Distribution，只有在独立 contract / lifecycle / replacement boundary 真正出现时才成为 package。

参见 [ROADMAP.zh-CN.md](./ROADMAP.zh-CN.md)、[`docs/releases/v0.2.0-rc.3.md`](./docs/releases/v0.2.0-rc.3.md) 与 [CONTRIBUTING.zh-CN.md](./CONTRIBUTING.zh-CN.md)。

## 安装

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

当前快速迭代阶段只维护一个 npm channel：`latest` 永远表示我们明确选择发布的最新版本，不再维护额外 prerelease dist-tag。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

## License

MIT
