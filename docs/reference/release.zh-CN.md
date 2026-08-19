[English](./release.md) | 简体中文

# Kernel prerelease 发布契约

本文档定义第一次公开 kernel artifact 的 release contract。R2 已经把 artifact 与验证门固定下来；R3 只负责真正发布与发布后验证。

## Artifact

- **Package：** `dsh-multi-tenant`
- **Version：** `0.1.0-rc.1`
- **npm dist-tag：** `next`
- **DSH compatibility target：** `0.1.0-rc.7`
- **Node：** `^22.19.0 || >=24.0.0`
- **Provenance：** enabled

`dsh-multi-tenant-web` 是 private package，**不属于**本次 release。

## Release guarantee

Artifact 只承诺 kernel 自己拥有的 contract：opaque principal/owner identity shape、claim-once 不可变 session ownership、无条件 cross-tenant denial、v0.1 same-user ownership、fail-closed unknown/foreign-session authorization、不可枚举的公开 denial，以及可替换 async `TenantSessionStore` contract 与共享 provider test suite。

内置 `InMemoryTenantSessionStore` 是 reference/bootstrap provider，不提供 production durability。

## 明确发布边界

本 prerelease 不声称提供 authentication、production DSH Web 多用户隔离、durable storage、MCP credential/context isolation、audit persistence、team ACL，也不提供 shell/filesystem/process/container/network isolation。

## 发布前验证

从干净 checkout 开始：

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

真正 publish 前，release workflow 会从 `main` 再完整执行一次该验证。

## R3 发布 workflow

发布由 `.github/workflows/release.yml` 完成，并且刻意只允许手工 `workflow_dispatch`。操作者必须输入精确 package version，并从 `main` 触发。Job 运行在 `npm-release` GitHub Environment 中，会：

1. 核对请求版本与 npm trusted-publishing capability；
2. 跑完整 `release:check`；
3. 核对 npm package name/repository，以及精确 version 是否已存在；
4. 只有 version 不存在时才 publish；
5. 从 registry 验证 `next`、repository metadata、integrity，并在干净 external consumer 中实际安装和调用；
6. registry 验证成功以后，才创建匹配的 `v0.1.0-rc.1` Git tag 与 GitHub prerelease。

Workflow 可安全重跑：如果精确 npm version 已经存在且属于本仓库，会跳过重复 publish，继续完成 registry verification / tag / GitHub release。

## 第一次发布 bootstrap

npm Trusted Publishing 是针对“已经存在的 package”配置的。由于 `dsh-multi-tenant` 此前从未发布，`0.1.0-rc.1` 需要一次性 bootstrap credential。

推荐流程：

1. 创建/配置 GitHub Environment `npm-release`（限制为 `main`；如需要可增加 required reviewer）；
2. 创建一个短有效期 npm granular token，使其在当前账户 2FA policy 下能够创建/发布 package；
3. token **只**保存为 `npm-release` Environment secret：`NPM_BOOTSTRAP_TOKEN`；
4. 在 `main` 上运行 `Publish kernel prerelease`，version 输入 `0.1.0-rc.1`；
5. package 创建成功后，在 npm 配置 Trusted Publishing：
   - GitHub owner：`GuoMonth`
   - repository：`dsh-multi-tenant`
   - workflow filename：`release.yml`
   - environment：`npm-release`
   - allowed action：`npm publish`；
6. 删除 `NPM_BOOTSTRAP_TOKEN`；Trusted Publishing 验证成功以后，再在 npm 侧限制传统 token publishing。

Workflow 授予 `id-token: write` 并启用 provenance。Trusted Publishing 配好以后，npm 使用短生命周期 OIDC credential，不再需要 bootstrap token。

## 发布后验证

Workflow 会对精确版本运行 `scripts/registry-smoke.mjs`。还可以人工用 DSH 再验证一次：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

只有 npm version 已存在、`next` 指向它、registry smoke 成功、并且匹配的 GitHub prerelease/tag 都存在时，R3 才算完成。
