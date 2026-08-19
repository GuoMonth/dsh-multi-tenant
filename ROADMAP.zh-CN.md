[English](./ROADMAP.md) | 简体中文

# 路线图 —— 为第一次发布收敛

状态：✅ 已完成 · 🚧 发布阻塞项 · 🤝 生态协作 · 🧭 后续 / 按需求触发 · ⛔ 明确边界。

## 发布目标

下一阶段的目标**不是**做出一整套完整的多租户 SaaS 分发版，而是先发布一个小而有用、边界诚实的内核版本：

- **`dsh-multi-tenant`** —— 第一个公开的 **0.1 预发布版本**（建议
  `0.1.0-rc.1`），目标基线为 **DeepSeek Harness `0.1.0-rc.7`**。
- **`dsh-multi-tenant-web`** —— 继续保持**实验性的 enforcement spike**。
  它的 production contract 不阻塞内核发布，因为缺失的 request/connection
  principal scope 属于 DSH transport 生态能力。

第一次发布的承诺刻意收窄：只承诺本仓库真正控制得住的 session 所有权与 fail-closed 授权。其他事情要么进入生态契约，要么明确列为边界。

## 边界矩阵

| Surface | 分类 | 本项目负责什么 | 阻塞第一次内核发布？ |
| --- | --- | --- | --- |
| Tenant principal / session ownership / access decision | **控制得住 → 严格强制** | 本仓库拥有契约并默认拒绝。 | **是** —— 已实现且由测试锁定。 |
| `TenantSessionStore` seam + contract suite | **控制得住 → 严格强制** | 本仓库拥有 seam；提供内存参考实现；第三方用共享套件证明 provider。 | **是** —— 已完成。 |
| Agent 创生准入（`setup`） | **控制得住 → 严格强制** | 保留 decorator/probe；每次目标版本推进时只重验受影响 DSH seam。 | **是** —— R1 已刷新 RC7 evidence。 |
| unary `ApiProxy` 分类 | **控制得住 → 严格强制** | 对真实 `RpcMethodMap` 穷举分类；未知 / 新增方法默认拒绝。 | **是** —— R1 已刷新 RC7 type/evidence。 |
| HTTP/WS request/connection principal scope | **需要生态协作 → 制定标准** | 定义最小、通用的 DSH seam 并向上游协作。不要 fork / 重写 Web transport。 | 内核**不阻塞**；production Web **阻塞**。 |
| mux / host stream 与 `respond` | **生态 seam 落地后由我们强制** | spike 中继续拒绝；有 principal-scoped transport seam 后再实现和测试。 | 内核不阻塞。 |
| Auth provider（JWT/OIDC/API key） | **后续 provider** | 真实 transport principal scope 存在后，再做可替换参考 provider。 | 否。 |
| 持久 ownership store | **后续 provider** | 有真实需求时增加 provider；provider seam 已存在。 | 否。 |
| `session.search` 租户可见性 | **生态 / 后续** | 当前拒绝；真正需要时再推动 scoped visibility/search contract。 | 否。 |
| Workspace / host-global management | **v0.1 范围外** | Web spike 中暴露到的地方继续拒绝；不替 DSH-global 资源凭空发明 tenant 语义。 | 否。 |
| tenant-aware MCP context propagation | **生态 / 后续** | DSH/MCP seam 稳定且有需求时，再定义一致性契约。 | 否。 |
| Shell / filesystem / process / container / network isolation | **明确边界** | 本插件家族不提供；强执行隔离属于 deployment/runtime 层。 | 否。 |
| Billing、UI、组织/用户管理 | **明确边界** | 不是本仓库目标。 | 否。 |
| 团队共享 / ACL / ownership reassignment | **v0.1 明确边界** | v0.1 保持 tenant+user 不可变所有权；未来如有需求另设计同租户 policy plane。 | 否。 |

## 已完成

- ✅ **M0 — 工程地基** —— monorepo、包规则、spec/ADR 纪律、CI。
- ✅ **M1 — 内核加固** —— claim-once ownership、fail-closed access、
  `TenantSessionStore`、共享契约测试、package smoke、架构门。
- ✅ **M2 — Session genesis proof** —— Agent `setup` 是 visibility 前的准入点；
  create / fork / subagent / resume 最初在 RC6 上建立 proof。
- ✅ **M3 — Web enforcement spike** —— 真实 `ApiProxy` facade、unary 穷举分类、
  fail-closed policy，以及 H3 transport 缺口已经识别。
- ✅ **边界治理原则** —— 控制得住就强制；需要生态协作就制定标准；控制不住就明确边界。当前目标基线为 RC7。
- ✅ **R1 — RC7 兼容性刷新** —— DSH proof pin/lockfile 已刷新到 RC7；相关源码 seam 已核对；session-genesis 与 admission runtime proof 在 Node 22.19 / Node 24 均通过；DSH pin 漂移检查与 runtime proof 已成为 CI gate。精确 evidence 见 `docs/reference/compatibility.md`。

## 发布主线 —— 接下来几轮迭代

只有下面这些事情阻塞第一次 `dsh-multi-tenant` 发布。

### ✅ R1 — RC7 兼容性刷新

R1 compatibility PR 已完成以下证明：

1. `@deepseek-ai/dsh-host-apiproxy` 以及解析出的 DSH dependency graph 均显式 pin 到 **`0.1.0-rc.7`**，并由 frozen lockfile 锁定；
2. RC6 → RC7 相关源码 seam 已定向核对，真实 runtime proof 在两条支持的 Node 版本线上重新执行；
3. 精确 RC7 release commit 与相关 source blob 已记录到 compatibility reference；
4. DSH target 已集中管理，package pin 漂移会直接令 CI 失败；
5. 未变化的架构没有重新设计，H3 继续留在 ecosystem track，而不是通过本地 transport fork 强行关闭。

### 🚧 R2 — 内核发布加固

1. package metadata 必须和真实内核范围一致 —— identity、ownership、authorization、store seam/testing；不能声称内置 MCP、audit、auth 或 production Web isolation；
2. 在 README / package docs 中明确发布 **supported guarantees** 与 **explicit boundaries**；
3. 跑发布门：frozen install、`pnpm verify`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke`，以及 RC compatibility probe；
4. 确定第一次 0.1 prerelease 版本（建议 `0.1.0-rc.1`），验证 packed consumer experience。

### 🚧 R3 — 发布内核 prerelease

- publish/tag `dsh-multi-tenant` 的 0.1 prerelease；
- release notes 明确 RC7 evidence baseline 与 security boundary；
- `dsh-multi-tenant-web` **不能**被描述成 production 多用户 Web 方案。它可以继续仅存在于仓库中，或者只有在明确 experimental/prerelease 标签下才发布。

R3 完成以后，项目就已经有一个真实版本，用户和生态作者可以围绕它开发，而不必等所有 SaaS 问题一起解决。

## 生态主线 —— 重要，但不阻塞内核发布

### 🤝 E1 — DSH principal-scope seam

RC7 当前公开的 `ConnectionRpcHandler` 仍然只有解码后的
`(endpoint, payload, signal)`，官方 Web carrier 文档也明确说明当前没有 authentication layer。因此本项目应该交付的是**一个小而通用的上游 seam**，不是本地 transport fork。

上游 proposal 应保持 tenant-agnostic，让调用方可以基于真实 HTTP request / WS upgrade 建立 request/connection-scoped API/security context。一致性要求至少覆盖：

- HTTP request scope 与 WebSocket connection lifetime；
- 并发 principal 之间没有 ambient/global cross-talk；
- 能在 `session.create` admission 以及 event delivery 之前安装 principal-bound `ApiProxy`；
- 如果真实 runtime evidence 证明需要，则包含 server-request response（`respond`）安全 correlation。

这个 proposal **不阻塞**内核发布。

### 🤝 E2 — seam 存在以后再做 production Web enforcement

DSH 提供足够的 principal-scope seam 后：

1. 把 `dsh-multi-tenant-web` 从 spike 变成可安装的 enforcement plugin；
2. 在同一 principal scope 下接通 admission、unary guard/filter、stream filtering 与 `respond`；
3. 对支持的 Web surface 增加最小 two-tenant adversarial E2E suite；
4. 到这一步才冻结 Web package public contract，并考虑 Web prerelease。

### 🤝 E3 — 其他生态 contract，只在有需求时启动

这些是独立 follow-up，不再形成串行的 M6/M7/M8 大链条：

- tenant-scoped search visibility；
- tenant-aware MCP principal/context propagation；
- 生态真正决定要 tenant-owned 的其他 DSH-global resource model。

每一项都先从 seam/contract + conformance expectation 开始，而不是先做大规模本地实现。

## 后续 owned provider —— 可选、独立包

🧭 这些可以在内核发布之后独立推进，不需要改内核：

- 一个 durable `TenantSessionStore` provider（PostgreSQL / Redis / MySQL —— 根据 contributor/user 真实需求选择，而不是为了 roadmap 对称而全做）；
- E1 落地后的 reference auth provider；
- 如果出现真实 use case，再做 tombstoned ownership 的 lifecycle/admin cleanup。

它们都不是证明内核契约所必需的。

## 明确边界 / 非目标

⛔ 0.1 版本线**不**声称提供强 process/container isolation。一个已通过租户授权的 Agent 仍拥有其所在 DSH deployment 授予的 shell/filesystem/network 能力。需要强执行隔离的部署必须在本插件家族之外强制。

⛔ 本仓库不会演变成 billing system、组织/用户目录、UI 产品或通用 RBAC framework。

⛔ 不会为了让 checklist 每一行都变成本地能力，就重新实现 DSH Web transport、session search engine、MCP runtime 或 host resource model。

⛔ v0.1 ownership 是不可变的 `(tenantId, userId)` ownership。跨用户共享、reassignment、admin inspection、team ACL 必须属于独立的 same-tenant policy plane，不能悄悄塞进 kernel。

## 什么阻塞什么

```text
RC7 compatibility ✅ ──> kernel release hardening ──> dsh-multi-tenant 0.1 prerelease

DSH principal-scope seam ──> production dsh-multi-tenant-web ──> Web E2E / Web release

search / MCP / durable providers / auth provider / audit / UI
        └──────────── 独立、按需求触发的 follow-up ─────────────┘
```

这份 Roadmap 刻意保持短小。只有真正阻塞**本仓库拥有的 release guarantee** 的事项才进入发布主线；生态事项放在生态主线；不支持的事情继续作为明确边界。
