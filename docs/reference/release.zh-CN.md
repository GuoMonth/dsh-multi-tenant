[English](./release.md) | 简体中文

# Release Contract

`0.3` 是当前 live release line。发布机制刻意保持很小：证明 artifact、发布一个 package、验证 exact registry result。

## 当前 Release Identity

- **Package：** `dsh-multi-tenant`
- **Candidate：** `0.3.0-rc.3`
- **Theme：** Durable Local Experience
- **Identity source：** `packages/multi-tenant/package.json`
- **npm dist-tag：** `latest`
- **DSH baseline：** `0.1.1-rc.2` @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- **Publishing：** GitHub Actions OIDC + npm Trusted Publishing
- **Provenance：** enabled

当前只有一个 publishable workspace package，也只有一条 publication workflow。

## 这一版证明什么

Release gate 同时覆盖 product-facing path 和 durable local ownership：

```text
现有产品 authentication
  -> TrustedSubject
  -> Product Ingress / Web bridge
  -> RuntimeComposition
  -> Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> Principal-aware create/resume
  -> immutable SQLite Session ownership
  -> Principal-owned DSH Agent
  -> 官方 MCP client
  -> native Agent-scoped MCP Tools
```

正常 DSH bundle install 现在默认使用 `SQLiteTenantSessionStore`，只依赖 Node 内置 `node:sqlite`。个人开发者不需要 PostgreSQL / Docker / native addon，Session ownership 就能跨本地进程重启保留。

当前 release note：`docs/releases/v0.3.0-rc.3.md`。

## Pre-publication Proof

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

Proof 包括当前 architecture invariant、release / docs preflight、typecheck / tests / build、精确 DSH / Cordis compatibility probe、真实 MCP wire execution、packed npm artifact clean-consumer 验证、真实 DSH Web First Product Experience proof，以及独立进程 SQLite durability proof。

`pnpm probe:fpe` 会 pack candidate、安装进 clean pinned DSH Web profile、真正启动 `dsh web`，然后证明 canonical identity、真实 MCP Tool、owner resume、cross-Principal resume denial、第二 Tenant，以及 raw starter credential 不泄漏。

`pnpm probe:sqlite` 会启动多个独立 Node process，共享同一个 SQLite 文件，证明 restart persistence、same-owner idempotency、sibling-Principal / cross-Tenant conflict，以及并发 multi-process claim 只有一个 winner。

`pnpm smoke` 同时检查 tarball contents、全部 public export target，并显式 import product / Web / diagnostics / starter / SQLite-store public surface。

## 已承认的 Web 边界

#41 继续作为显式 upstream boundary，而不是 release blocker。Pinned DSH 当前不会把 product-authenticated Principal 贯穿到每个 stock Web RPC business dispatch。

因此 production deployment contract 是把 DSH Web 放在 Product Gateway/BFF 后面的 private network / loopback；Gateway 先完成 authentication、canonical Tenant/Principal resolution 和受保护 Session/Agent resource authorization，再把请求转发给 DSH。公网客户端不能存在绕过路径直接访问 stock DSH `/api`。

SQLite 同样有明确定位：它是 zero-external-service local durable provider，不宣称 horizontally-scaled production persistence。

## Publication Flow

`.github/workflows/release.yml` 只从 `main` 手动 dispatch：

1. 从 package manifest 读取 exact version；
2. 执行完整 `pnpm release:check`，包括真实 Web FPE 和 SQLite durability proof；
3. 验证 npm repository ownership 与 exact-version 状态；
4. version 不存在时通过 OIDC / provenance 发布；
5. 验证 npm version / repository / integrity / `latest`；
6. 使用同一套 v0.3 consumer smoke 安装并执行 exact registry artifact；
7. 创建 matching Git tag 与 prerelease GitHub Release。

如果 exact version 已存在，会跳过重复 publish，但继续 verification / tag / release recovery。

## Permanent GitHub Actions

Live tree 只保留两条 workflow：

- `ci.yml` —— 当前 source / package / platform / FPE / SQLite durability evidence；
- `release.yml` —— 显式 publication + post-publication verification。

一次性 investigation workflow 的结论进入永久 test / gate 后，workflow 本身必须删除。

## Release Philosophy

Git history / tag 负责旧 prerelease 考古。Live repository 只保留当前 release note 与当前 release machinery，不继续背已经完成的 scope document 或过时 milestone artifact。

`0.3.0-rc.3` 仍然是 prerelease；真实产品 evidence 可以继续推动 deliberate breaking change，特别是 credential lifecycle、production Gateway/BFF evidence、multi-instance persistence 与长期 `Capability-as-Authority` 方向。