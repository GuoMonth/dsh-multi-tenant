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

### v0.2 —— 已发布的 Multi-Tenant Runtime Contract

`dsh-multi-tenant@0.2.0-rc.3` 已经是 v0.3 的公开 Runtime foundation。

```text
Deployment / Root
  ├─ shared ownership kernel
  └─ TenantRuntimeService
       └─ Tenant                  canonical capability node
            └─ Principal         canonical capability node
                 └─ derived integration fibers
                      └─ DSH Agent / future product operations
```

#### Canonical Runtime Structure

- Tenant / Principal 共用 `ensure / get / state / dispose` 语义；
- Principal 结构上嵌套在 Tenant 下，错误 tenant/principal 组合不可表达；
- 消费层可以只凭 identity 加入已有 canonical node，不需要知道 creation recipe；
- 显式再次提供 definition 时才校验 capability-definition drift。

#### Publication 与 Lifecycle

- asynchronous work 前先 reserve canonical identity；
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

CI 只证明当前架构真正依赖的 seam：

1. 精确 upstream source identity；
2. Session publication / rollback 语义；
3. Principal-derived Agent owner/context composition。

历史 Web/ApiProxy 与全局 admission-decorator 研究由 Git history 保存，不再占据 live workspace。

#### Release Model

- package version 只存在于 `packages/multi-tenant/package.json`；
- 手动 GitHub release workflow 自动读取这个版本；
- npm 只发布到 `latest`；
- registry smoke 验证 `latest` 指向刚发布的版本；
- prerelease / stable 语义由 SemVer 本身表达。

## v0.3 —— SaaS Framework

主开发线现在直接进入 SaaS Framework。

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

这张图描述的是目标 capability ownership，**不是提前批准好的 package name**。仓库不会预先 scaffold 这些 package。

### v0.3 优先级

1. **SaaS composition model** —— 定义 provider slot 与强类型 configuration/composition graph；
2. **Authenticated product boundary** —— 在真实 wire / product boundary 完成认证，resolve canonical Tenant / Principal，再从 derived integration fiber 驱动工作；
3. **Agent orchestration** —— 从 Principal-owned integration boundary create/resume/drive DSH Agent，同时保持 DSH Agent/Preset scope 语义；
4. **Reference Provider Family** —— Auth、credential/token storage、MCP tenancy、durable store、audit/usage 等，只有在独立 contract / lifecycle boundary 被证明后才实现；
5. **Distribution defaults** —— 提供一套官方推荐的开箱即用组合，同时 provider slot 可替换；
6. **Diagnostics & compatibility** —— startup validation、health、provider conformance、migration、清晰 compatibility matrix。

只有独立 API、replacement boundary、lifecycle、versioning boundary 或 distribution boundary 真正存在时，才创建新 package。Research / experiment 在此之前留在 test / script / docs 中。

Strong isolation 仍然是 deployment profile，不是 Context promise。未来 K8S profile 可以把一个 Tenant 映射到一个 Pod，同时保持同一套上层 SaaS contract。

## 工程规则

- 先全局设计，再局部修改；
- 优先使用让非法状态不可表达的数据结构；
- 显式建模 lifecycle / state transition；
- 用 TypeScript 强类型与泛型携带语义；
- 除技术正确性外，也必须考虑与当前产品方向的相关性；
- package version、DSH baseline 等 identity 只保留一个 source of truth；
- prerelease 阶段如果兼容性损害长期模型，直接破坏兼容；
- Git history 足够保存的旧实验，不继续占据 live tree；
- 使用 Cordis / DSH 原生抽象，不另造平行 registry 或本地 fork；
- package boundary 只有在独立价值被证明后才创建。

## Explicit Security Boundary

Cordis Context 是 trusted same-process composition / lifecycle boundary，不是 process sandbox。它不隔离 process memory、filesystem、shell、network、environment variable 或任意同进程插件。Strong isolation 属于 process / container / Pod boundary。
