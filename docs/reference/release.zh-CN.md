[English](./release.md) | 简体中文

# Release Contract

项目仍处于快速 prerelease 开发期，发布机制保持简单、证据优先、可复现。

## 当前 Release Identity

- **Package：** `dsh-multi-tenant`
- **Candidate：** `0.3.0-rc.1`
- **Release identity source：** `packages/multi-tenant/package.json`
- **npm dist-tag：** `latest`
- **DSH baseline：** `0.1.1-rc.2` @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- **Publishing：** GitHub Actions OIDC + npm Trusted Publishing
- **Provenance：** enabled

`dsh-multi-tenant` 仍然是唯一 publishable workspace package，也是唯一 release artifact。npm 当前状态不再在文档里重复硬编码；发布 workflow 会在 publication 前后直接读取 registry。

## 0.3.0-rc.1 代表什么

这是第一版 release gate 覆盖完整产品路径、而不只是 low-level Runtime 的 v0.3 candidate：

```text
trusted product subject
  -> Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> official DSH MCP client
  -> native Agent-scoped MCP Tools
```

Release note：`docs/releases/v0.3.0-rc.1.md`。

## Single Source of Truth

```text
packages/multi-tenant/package.json
  ├─ version
  └─ publishConfig.tag = latest
```

操作者不重复输入 version。只从 `main` 手动 dispatch release workflow，workflow 自动读取 manifest，并发布这一份唯一 release identity。

## 单一 npm Channel

快速 prerelease 阶段只保留一个 npm channel：

> `latest` = 项目明确发布并完成后置验证的最新版本。

Prerelease / stable 语义由 SemVer 表达，不维护第二套 `next` channel。

通过 DSH 安装：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

M5 integration 在运行时组合兼容 DSH 安装中提供的官方 `@deepseek-ai/dsh-mcp-client`，不 vendor、不 fork MCP protocol 实现。

## Pre-publication Proof

干净 checkout：

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

完整 release proof 包括：

- package / architecture / v0.3 contract invariants；
- release manifest 与文档 preflight；
- TypeScript typecheck、unit / contract tests；
- build + tarball export inspection；
- packed candidate + pinned DSH CLI 的 clean installed-artifact consumer smoke；
- exact DSH source identity；
- Cordis lifecycle assumptions；
- 真实 DSH Agent owner-context proof；
- 真实 stdio MCP server、官方 MCP client discovery、真实 `ToolRuntime.execute()`；
- Node 22.19 / Node 24 双版本验证。

Installed-artifact smoke 与 source tests 刻意分开：它验证用户实际安装到磁盘上的 tarball 能从真实 DSH 安装布局解析官方 MCP client，并通过 Product Ingress / RuntimeComposition / Credentials / Tenant MCP Config / Session authorization 这条 v0.3 public contract。

## Publication Flow

`.github/workflows/release.yml` 只从 `main` 手动 dispatch：

1. 从 manifest 读取 exact version；
2. 检查 npm Trusted Publishing capability；
3. frozen install + 完整 `pnpm release:check`；
4. 验证 npm package / repository identity 与 exact-version 状态；
5. exact version 不存在时通过 OIDC / provenance 发布；
6. 用同一套 v0.3 installed-consumer contract 安装并验证 exact registry artifact；
7. 确认 npm `latest` 指向 exact version；
8. 使用 `docs/releases/v<version>.md` 创建 matching Git tag 与 prerelease GitHub Release。

如果 exact version 已存在，workflow 会跳过重复 publish，但仍继续 registry verification，并可以恢复 tag / release。

## Registry Proof

`scripts/registry-smoke.mjs` 先验证 npm version / repository / integrity / `latest`，然后把 exact registry spec 交给 `scripts/artifact-consumer-smoke.mjs`。因此 pre-publication tarball 与 post-publication npm artifact 使用同一份 v0.3 consumer contract，不再维护一套过时的 v0.2 registry smoke 叙事。

## Workflow Policy

Release convergence 结束后只保留两类永久 GitHub Actions：

- `ci.yml`：日常 source / package / platform evidence；
- `release.yml`：显式 mainline publication + registry verification。

为了回答一次性问题可以临时建立 audit workflow，但结论一旦进入永久 test / release gate，临时 workflow 必须删除。

## Release Philosophy

Release automation 用来保护 correctness，不制造 ceremony。`0.3.0-rc.1` 仍是 prerelease；真实使用如果证明 contract 不够好，仍允许 deliberate breaking change，尤其是长期 `Capability-as-Authority` / Broker 方向。
