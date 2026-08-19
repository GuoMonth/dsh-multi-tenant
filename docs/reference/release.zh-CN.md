[English](./release.md) | 简体中文

# Kernel prerelease 发布契约

本文档定义第一次公开 kernel artifact 的 release contract。目标是让 R3 只做机械化发布：R2 决定“允许发布什么、必须证明什么”，R3 负责真正 publish。

## Artifact

- **Package：** `dsh-multi-tenant`
- **Version：** `0.1.0-rc.1`
- **npm dist-tag：** `next`
- **DSH compatibility target：** `0.1.0-rc.7`
- **Node：** `^22.19.0 || >=24.0.0`

`dsh-multi-tenant-web` 是 private workspace package，**不属于**这次 release。

Kernel package 设置 `publishConfig.tag = next`，因此普通 publish 不会把 npm `latest` 指向 prerelease。Web workspace 设置 `private: true`，npm-compatible publish 工具必须拒绝发布它。

## Release guarantee

Artifact 只承诺 kernel 自己拥有的 contract：

- opaque `TenantPrincipal` / `SessionOwner` identity shape；
- claim-once、不可变 session ownership；
- 无条件 cross-tenant denial；
- v0.1 same-user ownership（同 tenant、不同 user 仍拒绝）；
- fail-closed unknown/foreign-session authorization；
- 不可枚举的公开 denial；
- 可替换 async `TenantSessionStore` contract 与共享 provider test suite。

内置 `InMemoryTenantSessionStore` 是 reference/bootstrap provider，不提供 production durability。

## 明确发布边界

这个 prerelease 不声称提供 authentication、production DSH Web 多用户隔离、durable storage、MCP credential/context isolation、audit persistence、team ACL，也不提供 shell/filesystem/process/container/network isolation。这些事情要么属于 ecosystem/later-provider track，要么已经在 roadmap 中明确列为 non-goal。

## 一条命令做 preflight

从干净 checkout 开始：

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` 会执行：

1. package/architecture verify 与 DSH pin-drift check；
2. release-manifest preflight（唯一 publishable workspace、精确 version/tag、bundle/exports/files metadata、Web package private）；
3. typecheck 与 unit/contract test；
4. build；
5. packed external-consumer smoke（真实 tarball、干净 consumer install/import）；
6. RC7 session-genesis 与 Agent admission runtime proof。

GitHub CI 会在 Node 22.19.0 与 Node 24 两条线上同时执行 quality 与 DSH compatibility gate。

## R3 发布 checklist

R3 应保持为“只发布”的变更/流程：

1. R2 合并前所有 CI lane 必须全绿；
2. 从通过全部 gate 的精确 `main` commit 发布；
3. **只**发布 `dsh-multi-tenant@0.1.0-rc.1`；
4. prerelease 保持在 `next`，不要移动 `latest`；
5. 创建匹配的 Git tag / GitHub release；
6. release notes 标出 DSH RC7 evidence baseline，并重复明确 security boundary；
7. 通过 DSH 实际安装 registry artifact 做发布后验证：

```sh
dsh plugin --profile <profile> add dsh-multi-tenant@next
```

Publish authentication / provenance 的具体机制属于 R3；不要在那一步重新改变这里已经确定的 package contract。
