[English](./release.md) | 简体中文

# Release Contract

`0.3` 是当前 live release line。发布机制刻意保持很小：证明 artifact、发布一个 package、验证 exact registry result。

## 当前 Release Identity

- **Package：** `dsh-multi-tenant`
- **Candidate：** `0.3.0-rc.1`
- **Identity source：** `packages/multi-tenant/package.json`
- **npm dist-tag：** `latest`
- **DSH baseline：** `0.1.1-rc.2` @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- **Publishing：** GitHub Actions OIDC + npm Trusted Publishing
- **Provenance：** enabled

当前只有一个 publishable workspace package，也只有一条 publication workflow。

## 这一版证明什么

Release gate 覆盖完整 product-facing path：

```text
trusted product subject
  -> Product Ingress
  -> RuntimeComposition
  -> Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> safe create/resume
  -> Principal-owned DSH Agent
  -> 官方 MCP client
  -> native Agent-scoped MCP Tools
```

当前 release note：`docs/releases/v0.3.0-rc.1.md`。

## Pre-publication Proof

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

Proof 包括当前 architecture invariant、release / docs preflight、typecheck / tests / build、精确 DSH / Cordis compatibility probe、真实 MCP wire execution，以及把 packed npm artifact 与 pinned DSH CLI 一起安装到 clean consumer 的验证。

`pnpm smoke` 同时检查 tarball contents 与全部 public export targets，所以不再维护旧的独立 package-smoke pipeline。

## Publication Flow

`.github/workflows/release.yml` 只从 `main` 手动 dispatch：

1. 从 package manifest 读取 exact version；
2. 再跑一次完整 release proof；
3. 验证 npm repository ownership 与 exact-version 状态；
4. version 不存在时通过 OIDC / provenance 发布；
5. 验证 npm version / repository / integrity / `latest`；
6. 使用同一套 v0.3 consumer smoke 安装并执行 exact registry artifact；
7. 创建 matching Git tag 与 prerelease GitHub Release。

如果 exact version 已存在，会跳过重复 publish，但继续 verification / tag / release recovery。

## Permanent GitHub Actions

Live tree 只保留两条 workflow：

- `ci.yml` —— 当前 source / package / platform evidence；
- `release.yml` —— 显式 publication + post-publication verification。

一次性 investigation workflow 的结论进入永久 test / gate 后，workflow 本身必须删除。

## Release Philosophy

Git history / tag 负责保存旧 prerelease 的考古信息。Live repository 不为了“历史完整”继续保留 `0.1` / `0.2` release pipeline、旧 release note 或 milestone-specific verification。

`0.3.0-rc.1` 仍然是 prerelease；真实产品 evidence 如果证明更好的 contract，允许 deliberate breaking change。
