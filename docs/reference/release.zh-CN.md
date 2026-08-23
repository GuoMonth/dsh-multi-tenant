[English](./release.md) | 简体中文

# Release Contract

项目处于快速 prerelease 开发期，发布机制刻意保持简单、确定、可复现。

## 当前 Artifact

- **Package：** `dsh-multi-tenant`
- **当前 version：** 从 `packages/multi-tenant/package.json` 读取
- **当前 candidate：** `0.2.0-rc.3`
- **npm dist-tag：** `latest`
- **DSH baseline：** `0.1.1-rc.2` @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- **Publishing：** GitHub Actions OIDC + npm Trusted Publishing
- **Provenance：** enabled

`dsh-multi-tenant-web` 继续保持 private。

## Single Source of Truth

Package manifest 拥有 release identity：

```text
packages/multi-tenant/package.json
  ├─ version
  └─ publishConfig.tag = latest
```

Release workflow 不再让操作者重复输入 version。只需要从 `main` 手动 dispatch，workflow 自动读取 manifest、执行完整验证并发布该版本。

## 单一 npm Channel

当前快速迭代阶段只维护一个 npm channel：

> `latest` = 项目明确选择发布的最新版本。

Prerelease / stable 语义由 SemVer 本身表达（例如 `0.2.0-rc.3`，以后可能是 `0.2.0`），不再额外维护 `next`。

安装当前版本：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

## Pre-publication Proof

干净 checkout 上执行：

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

完整 proof 包括 package / architecture invariant、release preflight、TypeScript typecheck、unit / contract tests、build、packed external-consumer smoke 与精确版本 DSH compatibility probes。

CI 还会独立 checkout 精确 upstream DSH release commit 并验证源码 version。

## Publication Flow

`.github/workflows/release.yml` 从 `main` 手动 dispatch，并依次：

1. 从 `packages/multi-tenant/package.json.version` 得到唯一 release identity；
2. 验证 npm Trusted Publishing capability；
3. frozen install + `pnpm release:check`；
4. 检查 npm repository ownership 与 exact version 是否已存在；
5. 需要时通过 OIDC / provenance 发布；
6. 验证 exact registry artifact，并确认 `latest` 指向该版本；
7. 创建 matching Git tag 与 GitHub release。

如果 exact version 已发布，workflow 会跳过重复 publish，但仍可继续 verification / tag / release recovery。

## Registry Proof

`scripts/registry-smoke.mjs` 会把精确发布 artifact 安装到干净 consumer，并验证当前 Runtime Contract：

- store + ownership kernel；
- `ctx.tenantRuntime`；
- canonical Tenant / Principal creation；
- tenant capability inheritance；
- 从 Principal Context 执行 durable session ownership；
- provider store contract；
- npm `latest` 指向当前 release。

## Release Philosophy

Release automation 的目标是保护 correctness，而不是制造流程负担。当前阶段优先 frequent explicit release，不维护多个 channel，也不为了兼容承诺阻碍结构优化。

如果更好的 ownership model、数据结构、lifecycle state machine 或 semantic type 需要 prerelease breaking change，就直接改模型并发布新版本。
