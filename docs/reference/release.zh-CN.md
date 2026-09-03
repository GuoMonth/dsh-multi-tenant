# 发布检查

当前 release identity 是 `dsh-multi-tenant@0.4.0-alpha.3`，对应 Git tag 为 `v0.4.0-alpha.3`。npm 分发使用 `alpha` dist-tag，不得更新 `latest`。

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` 会验证 `0.4` 公共面和精确 DSH target、release metadata、peer dependency 一致性、类型声明、unit/contract/Web/真实 MCP 测试、build 产物、SQLite restart 与遗留 provisioning 恢复、lifecycle abort、Secret 泄漏探针，以及带 provider contract typecheck 的全新安装 tarball consumer。

CI 在 Node 22.19 和 Node 24 上重复执行，并单独 checkout DSH commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`，核对精确的 `0.1.2-rc.1` 源码身份。

Preflight 会拒绝项目 workflow 中任何可变的第三方 `uses:`，已审核 Action 全部固定到完整 commit SHA。pnpm 明确执行 1,440 分钟 release-age 延迟，只有已审核 DSH RC.1 源码对应的 exact package 可以例外。官方 JSONL 测试 backend 仅是 dev dependency；其 `koffi` install 是唯一允许的 native dependency build，冗余的 `esbuild` postinstall 仍被明确拒绝。

这些命令不会发布 npm、创建 Git tag 或创建 GitHub Release。源码 tag、npm artifact 和 GitHub prerelease 是可以分别核验的 release 产物。

分发必须显式手动触发 workflow，并要求待发布的精确 `main` commit 已有成功的 CI 结果。该 workflow 通过 npm Trusted Publishing 和 provenance 发布，验证 registry artifact 与 `alpha` dist-tag，复用指向同一提交的源码 tag（不存在时才创建），最后创建对应 GitHub prerelease；如果已有 tag 指向其他提交则直接失败。
