[English](./release.md) | 简体中文

# Release Contract

`0.3` 是当前 live release line。发布机制刻意保持很小：证明 artifact、发布一个 package、验证 exact registry result。

## 当前 Release Identity

- **Package：** `dsh-multi-tenant`
- **Candidate：** `0.3.0-rc.2`
- **Theme：** First Product Experience
- **Identity source：** `packages/multi-tenant/package.json`
- **npm dist-tag：** `latest`
- **DSH baseline：** `0.1.1-rc.2` @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- **Publishing：** GitHub Actions OIDC + npm Trusted Publishing
- **Provenance：** enabled

当前只有一个 publishable workspace package，也只有一条 publication workflow。

## 这一版证明什么

Release gate 覆盖 product-facing path：

```text
现有产品 authentication
  -> TrustedSubject
  -> Product Ingress / Web bridge
  -> RuntimeComposition
  -> Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> Principal-aware create/resume
  -> Principal-owned DSH Agent
  -> 官方 MCP client
  -> native Agent-scoped MCP Tools
```

当前 release note：`docs/releases/v0.3.0-rc.2.md`。

## Pre-publication Proof

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

Proof 包括当前 architecture invariant、release / docs preflight、typecheck / tests / build、精确 DSH / Cordis compatibility probe、真实 MCP wire execution、packed npm artifact clean-consumer 验证，以及真实 DSH Web First Product Experience proof。

`pnpm probe:fpe` 会 pack candidate、安装进 clean pinned DSH Web profile、真正启动 `dsh web`，然后证明 canonical identity、真实 MCP Tool、owner resume、cross-Principal resume denial、第二 Tenant，以及 raw starter credential 不泄漏。

`pnpm smoke` 同时检查 tarball contents、全部 public export target，并显式 import rc.2 新增的 `product`、`web`、`diagnostics`、`starter` public surface。

## Publication Flow

`.github/workflows/release.yml` 只从 `main` 手动 dispatch：

1. 从 package manifest 读取 exact version；
2. 执行完整 `pnpm release:check`，包括真实 Web FPE proof；
3. 验证 npm repository ownership 与 exact-version 状态；
4. version 不存在时通过 OIDC / provenance 发布；
5. 验证 npm version / repository / integrity / `latest`；
6. 使用同一套 v0.3 consumer smoke 安装并执行 exact registry artifact；
7. 创建 matching Git tag 与 prerelease GitHub Release。

如果 exact version 已存在，会跳过重复 publish，但继续 verification / tag / release recovery。

## Permanent GitHub Actions

Live tree 只保留两条 workflow：

- `ci.yml` —— 当前 source / package / platform / FPE evidence；
- `release.yml` —— 显式 publication + post-publication verification。

一次性 investigation workflow 的结论进入永久 test / gate 后，workflow 本身必须删除。

## Release Philosophy

Git history / tag 负责旧 prerelease 考古。Live repository 只保留当前 release note 与当前 release machinery，不继续背已经完成的 scope document 或过时 milestone artifact。

`0.3.0-rc.2` 仍然是 prerelease；真实产品 evidence 可以继续推动 deliberate breaking change，特别是 stock DSH Web authority propagation、production persistence 与长期 `Capability-as-Authority` 方向。
