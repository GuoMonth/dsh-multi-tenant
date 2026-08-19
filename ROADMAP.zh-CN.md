[English](./ROADMAP.md) | 简体中文

# 路线图 —— Kernel 已发布，向 stable 0.1 收敛

状态：✅ 已完成 · 🚧 release candidate · 🤝 生态协作 · 🧭 后续 / 按需求触发 · ⛔ 明确边界。

## 当前状态

`dsh-multi-tenant` 已经拥有真实公开的 prerelease 版本线，目标基线仍是 DeepSeek Harness `0.1.0-rc.7`。

- ✅ `0.1.0-rc.1` 已发布到 npm `next`，带 provenance。
- ✅ Registry external-consumer smoke 已通过。
- ✅ 匹配的 Git tag / GitHub prerelease 已创建。
- ✅ npm Trusted Publishing 已成为发布路径；release workflow 现在是 OIDC-only。
- 🚧 `0.1.0-rc.2` 是进入 `0.1.0` stable 决策前最后一个计划中的 API 收敛 candidate。

发布承诺继续刻意收窄：只承诺本仓库真正拥有的不可变 session ownership 与 fail-closed authorization。

## 边界矩阵

| Surface | 分类 | 项目立场 |
| --- | --- | --- |
| Tenant/user identity + session ownership + access decision | **控制得住 → 严格强制** | Kernel contract；fail closed，并由测试锁定。 |
| `TenantSessionStore` seam + shared contract suite | **控制得住 → 严格强制** | Kernel-owned seam；只内置内存参考实现。 |
| Agent 创生准入（`setup`） | **控制得住 → 严格强制** | RC7 runtime proof 继续作为 compatibility gate。 |
| unary `ApiProxy` 分类 | **控制得住 → 严格强制** | private Web spike 中穷举并 fail closed。 |
| HTTP/WS request/connection principal scope | **需要生态协作 → 制定标准** | 需要通用 DSH transport seam；不 fork transport。 |
| Production Web streams / `respond` / admission | **生态 seam 后再强制** | principal scope 存在前，未支持 surface 继续 deny。 |
| Durable ownership store | **后续 provider** | 只有真实 contributor/user demand 时才做。 |
| Auth provider | **后续 provider** | 真实 transport principal scope 存在后再做。 |
| `session.search` tenant visibility | **生态 / 后续** | 正确 scoped-query 语义存在前继续 deny。 |
| MCP tenant context | **生态 / 后续** | seam 与需求都具体以后再标准化。 |
| Shell/filesystem/process/container/network isolation | **明确边界** | deployment/runtime 责任，不属于本插件家族。 |
| Billing/UI/组织用户管理/general RBAC | **明确边界** | 不是仓库目标。 |
| Team sharing/ACL/reassignment | **v0.1 明确边界** | 真有需要时进入独立 same-tenant policy plane。 |

## 已完成发布主线

- ✅ **R1 — RC7 compatibility refresh** —— 集中 DSH target/pin，并在 Node 22.19 + Node 24 跑受影响 runtime proof。
- ✅ **R2 — Kernel release hardening** —— package metadata、supported guarantee、explicit boundary、packed external-consumer smoke 与 release preflight 已建立。
- ✅ **R3 — 第一次公开 prerelease** —— `dsh-multi-tenant@0.1.0-rc.1` 已发布到 npm `next`；provenance、registry smoke、Git tag 与 GitHub prerelease 全部成功。

历史 evidence 见 `docs/reference/compatibility.md`；当前发布机制见 `docs/reference/release.md`。

## 🚧 rc.2 —— stable 前最后一次 API subtraction

`0.1.0-rc.2` 刻意是收敛版本，不是 feature release：

1. 把 `TenantPrincipal` 收成 `{ tenantId, userId }`；
2. 删除未使用的 role validation/public contract；
3. RBAC/policy attribute 继续留在 ownership kernel 之外；
4. 只通过 npm Trusted Publishing/OIDC 发布，不再保留 bootstrap token fallback；
5. 重跑完全相同的 release proof 与 registry consumer smoke。

rc.2 以后，**不要为了 roadmap 进度再造 rc.3**。除非出现真实 bug、upstream compatibility change，或者真实用户反馈要求 contract 变化，否则下一步应该判断是否进入 `0.1.0` stable。

## 生态主线 —— 不阻塞 kernel

### 🤝 E1 — DSH principal-scope seam

向上游提出最小、tenant-agnostic 的 request/connection-scoped security-context seam。它应覆盖 HTTP request scope、WebSocket connection lifetime、并发 principal 不发生 ambient/global cross-talk、session publication 前 admission，以及必要的 event/response correlation。

### 🤝 E2 — E1 以后再做 production Web enforcement

只有 DSH 暴露足够 principal-scope seam 后，`dsh-multi-tenant-web` 才考虑 publish：在同一 principal scope 下接通 admission/unary/streams/respond，并增加最小 two-tenant adversarial E2E。

### 🤝 E3 — 其他 contract 只按需求启动

Search visibility、MCP context propagation、DSH-global resource tenancy 都是独立、demand-gated contract，不是强制 milestone。

## 后续 provider

🧭 Durable store provider（PostgreSQL/Redis/MySQL）、reference auth provider、lifecycle/admin cleanup 都可以在真实需求出现后独立增加，不扩大 kernel guarantee。

## 明确非目标

⛔ 0.1 版本线不声称提供强 process/container isolation。通过 tenant authorization 的 Agent 仍拥有 deployment 授予的 shell/filesystem/network 能力。

⛔ 仓库不会变成 billing system、identity directory、UI 产品或 general RBAC framework。

⛔ 不会为了让所有问题本地可解，就重写 DSH Web transport、search、MCP runtime 或 host resource model。

⛔ v0.1 ownership 是不可变 `(tenantId, userId)`。`TenantPrincipal` 不包含 roles/permissions；cross-user sharing 与 admin policy 必须进入独立 same-tenant policy plane。

这份 Roadmap 刻意保持短小：拥有的保证严格强制；依赖生态的地方制定标准；其余继续明确边界。
