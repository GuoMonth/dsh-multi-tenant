# 发布检查

当前候选版本是 npm `alpha` tag 下的 `dsh-multi-tenant@0.4.0-alpha.2`。

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` 会验证 `0.4` 公共面和精确 DSH target、release metadata、peer dependency 一致性、类型声明、unit/contract/Web/真实 MCP 测试、build 产物、SQLite restart 与遗留 provisioning 恢复、lifecycle abort、Secret 泄漏探针，以及带 provider contract typecheck 的全新安装 tarball consumer。

CI 在 Node 22.19 和 Node 24 上重复执行，并单独 checkout DSH commit `db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5` 核对源码身份。

Preflight 会拒绝项目 workflow 中任何可变的第三方 `uses:`，已审核 Action 全部固定到完整 commit SHA。pnpm 明确执行 1,440 分钟 release-age 延迟，只有已审核 DSH alpha.5 源码对应的 exact package 可以例外。官方 JSONL 测试 backend 仅是 dev dependency；其 `koffi` install 是唯一允许的 native dependency build，冗余的 `esbuild` postinstall 仍被明确拒绝。

这些命令不会发布 npm 或创建 GitHub Release。发布必须显式手动触发 workflow，并要求待发布的精确 `main` commit 已有成功的 CI 结果。
