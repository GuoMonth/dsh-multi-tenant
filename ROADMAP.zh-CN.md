[English](./ROADMAP.md) | 简体中文

# Roadmap

项目当前处于快速推进阶段，不承诺 prerelease API 兼容。核心规则是：以长期系统的最佳工程结构、数据结构、状态流转与语义类型为目标，不为了保留早期形态制造兼容债。

## 版本线

### v0.1 —— 冻结的 Security Kernel

v0.1 负责 durable authorization invariant：

- 最小 `{ tenantId, userId }` principal identity；
- claim-once immutable session ownership；
- fail-closed authorization；
- 可替换 `TenantSessionStore` contract。

这一层应该保持小、稳定、无聊。

### v0.2 —— Multi-Tenant Runtime Contract

v0.2 把 tenancy 变成 first-class runtime structure，而不是到处传 `tenantId`。

最终收口 MR 全绿并合并后，v0.2 即视为完成。其核心 contract 为：

```text
Deployment / Root
  ├─ shared ownership kernel
  └─ TenantRuntimeService
       └─ Tenant                  canonical capability node
            └─ Principal         canonical capability node
                 └─ derived integration fibers
                      └─ DSH Agent / transport / provider operations
```

#### Canonical Runtime Structure

- Tenant / Principal 共用 `ensure / get / state / dispose` 语义；
- Principal 结构上嵌套在 Tenant 下，错误 tenant/principal 组合不可表达；
- 消费层可以只凭 identity 加入已有 canonical node，不需要知道 creation recipe；
- 显式再次提供 definition 时才校验 capability-definition drift。

#### Publication 与 Lifecycle

- asynchronous work 之前先 reserve canonical identity；
- setup 在 unpublished Cordis subtree 上运行；
- 可选同步 `commit()` 拥有精确 publication boundary；
- 并发 `ensure()` single-flight；
- preparing transaction 是 first-class、可取消 lifecycle resource；
- registry shutdown 先 close admission，再 cancel unpublished creation，最后 drain published scope；
- setup 失败完整 rollback；
- Tenant teardown 拥有 Principal teardown。

#### Capability 与 Agent 语义

- Cordis service isolation 负责 Tenant / Principal capability authority 与 provider lifetime；
- DSH `@deepseek-ai/dsh-scope` 负责 Agent / Preset registration visibility；
- Principal Context 是 capability root，不是 dependency-injection bypass；
- 具体 operation 从 Principal 派生 integration fiber，并显式 inject 所需 service；
- Agent creation 使用真实 DSH caller-bound `ownerCtx` seam，不复制 Context 私有状态。

#### Provider Ecosystem Contract

`dsh-multi-tenant/testing` 提供可执行 Runtime Capability Provider Contract，覆盖 A/B isolation、leakage、inheritance、sibling、teardown、recreation 与 unpublished setup。

#### DSH Baseline 与 Evidence

当前明确 baseline：

- DSH version：`0.1.1-rc.2`
- release commit：`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

Baseline 由我们手动推进；blocking CI 永远不跟随 floating upstream state。

CI 同时证明两件事：

1. checkout 精确 upstream release commit，验证源码身份；
2. 对精确 npm package 运行 session genesis、admission/publication、Agent owner/composition executable probes。

#### Release Model

当前 release mechanics 刻意保持简单：

- package version 只存在于 `packages/multi-tenant/package.json`；
- 手动 GitHub release workflow 自动读取这个版本；
- npm 只发布到 `latest`；
- registry smoke 验证 `latest` 指向刚发布的版本；
- prerelease / stable 语义由 SemVer 本身表达，不再维护第二个 npm channel。

## v0.3 —— SaaS Framework

v0.2 冻结后，主线直接进入 SaaS Framework。

目标是：**由可替换 Plugin Family 构成、但提供 opinionated 开箱即用体验的 SaaS Framework / Distribution**，而不是一个 monolithic super-plugin。

```text
                         dsh-saas
                 SaaS Distribution / Framework
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
      Auth              Credentials            MCP
        │                   │                   │
    Transport              Audit              Usage
        │                   │                   │
        └──────────── Provider Contracts ───────┘
                            │
                   dsh-multi-tenant
                 Runtime Contract + Kernel
```

### v0.3 优先级

1. **SaaS composition model** —— 定义 provider slot 与强类型 configuration/composition graph；
2. **Authenticated transport binding** —— wire boundary 完成认证，resolve canonical Tenant / Principal，再从 derived integration fiber 驱动工作；
3. **Agent orchestration** —— 从 Principal-owned integration boundary create/resume/drive DSH Agent，同时保持 DSH Agent/Preset scope 语义；
4. **Reference Provider Family** —— Auth、credential/token storage、MCP tenancy、durable store、audit/usage 等按需求实现；
5. **Distribution defaults** —— 提供一套官方推荐的开箱即用组合，同时所有 provider slot 可替换；
6. **Diagnostics & compatibility** —— startup validation、health、provider conformance、migration、清晰 compatibility matrix。

Strong isolation 仍然是 deployment profile，不是 Context promise。未来 K8S profile 可以把一个 Tenant 映射到一个 Pod，同时保持同一套上层 SaaS contract。

## 工程规则

- 先全局设计，再局部修改；
- 优先使用让非法状态不可表达的数据结构；
- 显式建模 lifecycle / state transition；
- 用 TypeScript 强类型与泛型携带语义；
- package version、DSH baseline 等 identity 只保留一个 source of truth；
- prerelease 阶段如果兼容性损害长期模型，直接破坏兼容；
- 使用 Cordis / DSH 原生抽象，不另造平行 registry 或本地 fork；
- 控制得住的边界严格 enforce，需要生态协作的定义标准，控制不住的明确 boundary。

## Explicit Security Boundary

Cordis Context 是 trusted same-process composition / lifecycle boundary，不是 process sandbox。它不隔离 process memory、filesystem、shell、network、environment variable 或任意同进程插件。Strong isolation 属于 process / container / Pod boundary。
