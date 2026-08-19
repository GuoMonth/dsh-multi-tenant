[English](./release.md) | 简体中文

# Kernel prerelease 发布契约

Kernel 已经拥有真实公开的 prerelease 版本线。本文档定义当前 release artifact，以及发布前必须通过的机械化证明。

## 当前 artifact

- **Package：** `dsh-multi-tenant`
- **Candidate：** `0.1.0-rc.2`
- **npm dist-tag：** `next`
- **DSH compatibility target：** `0.1.0-rc.7`
- **Node：** `^22.19.0 || >=24.0.0`
- **Publishing：** npm Trusted Publishing / GitHub Actions OIDC
- **Provenance：** enabled

`dsh-multi-tenant-web` 继续保持 private，不属于本次 release。

## 为什么需要 rc.2

`0.1.0-rc.1` 已经成功建立第一个公开 artifact，并完成 registry smoke、provenance、Git tag 与 GitHub prerelease。进入 stable 0.1 以前，rc.2 做最后一次主动 API subtraction：删除 `TenantPrincipal.roles`。

Ownership kernel 从未读取 roles。继续把它作为 required public field，会迫使每个调用方携带一个本 package 明确不拥有的 RBAC vocabulary。因此 principal 收敛到 kernel 真正强制的 identity：

```ts
interface TenantPrincipal {
  tenantId: string
  userId: string
}
```

未来如果真实需求需要 roles / permissions / admin policy，应进入独立 policy plane。

## Release guarantee

Artifact 只承诺 kernel 自己拥有的 contract：opaque tenant/user identity、claim-once 不可变 session ownership、无条件 cross-tenant denial、v0.1 same-user ownership、fail-closed unknown/foreign-session authorization、不可枚举公开 denial，以及可替换 async `TenantSessionStore` contract 与共享 provider test suite。

内置 `InMemoryTenantSessionStore` 是 reference/bootstrap provider，不提供 production durability。

## 明确边界

本 prerelease 不声称提供 authentication、production DSH Web 多用户隔离、durable storage、MCP credential/context isolation、audit persistence、team ACL、general RBAC，也不提供 shell/filesystem/process/container/network isolation。

## 发布前验证

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

真正 publish 前，release workflow 会从 `main` 再完整执行一次。

## OIDC-only 发布

发布由 `.github/workflows/release.yml` 完成，并刻意保持手工 `workflow_dispatch`。操作者必须输入精确 package version，并从 `main` 触发。Job 运行在 `npm-release` GitHub Environment 中，具备 `id-token: write`，**不再存在 npm publish token fallback**。

Workflow 会：

1. 核对 branch/version 与 npm trusted-publishing capability；
2. 跑完整 `release:check`；
3. 核对 npm package ownership 与精确 version 状态；
4. version 不存在时，仅通过 npm Trusted Publishing/OIDC publish；
5. 验证 `next`、repository metadata、integrity，并在干净 external consumer 中安装调用；
6. registry smoke 成功以后才创建匹配的 Git tag 与 GitHub prerelease。

Workflow 可安全重跑：如果匹配版本已经存在，会跳过重复 publish，继续完成 verification/tag/release recovery。

rc.1 首次发布使用过的 bootstrap token 已经不再属于 workflow。维护者应删除/revoke 任何仍然存在的 bootstrap credential。

## 发布后验证

Workflow 会对精确版本运行 `scripts/registry-smoke.mjs`。还可以人工使用 DSH 验证：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

rc.2 以后，项目应该优先观察真实使用反馈，不再给 kernel 增加推测性 API。除非出现真实 bug 或 upstream compatibility change，否则下一次 release decision 应该是判断是否进入 `0.1.0` stable。
