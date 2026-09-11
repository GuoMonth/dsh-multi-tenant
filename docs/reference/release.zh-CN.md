# 发布检查

Release identity 是 `dsh-multi-tenant@0.6.0`，对应 Git tag 为 `v0.6.0`。npm 分发使用 `latest` dist-tag。唯一支持的 Harness 基线是 DSH `0.1.5-rc.2`，对应 commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`。

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` 会验证公共面和精确 DSH target、release metadata、peer dependency 一致性、类型声明、unit/contract/Web/真实 MCP 测试、build 产物、SQLite restart 与遗留 provisioning 恢复、lifecycle abort、Secret 泄漏探针，以及带 provider contract typecheck 的全新安装 tarball consumer。

CI 在 Node 22.19 和 Node 24 上重复执行，并单独 checkout DSH commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`，核对精确的 `0.1.5-rc.2` 源码身份。

Preflight 会拒绝项目 workflow 中任何可变的第三方 `uses:`，已审核 Action 全部固定到完整 commit SHA。pnpm 明确执行 1,440 分钟 release-age 延迟，只有已审核的 exact DSH 包及逐项列出的 native addon 产物可以例外。官方 JSONL 测试 backend 仅是 dev dependency；其 `koffi` install 是唯一允许的 native dependency build，冗余的 `esbuild` postinstall 仍被明确拒绝。

这些命令不会发布 npm、创建 Git tag 或创建 GitHub Release。源码 tag、npm artifact 和 GitHub Release 是可以分别核验的 release 产物。

分发必须显式手动触发 workflow，并要求待发布的精确 `main` commit 已有成功的 CI 结果。该 workflow 通过 npm Trusted Publishing 和 provenance 发布，验证 registry artifact 与 `latest` dist-tag，复用指向同一提交的源码 tag（不存在时才创建），最后创建对应 GitHub Release；如果已有 tag 指向其他提交则直接失败。

源码版本与 npm 通道以 `packages/multi-tenant/package.json` 为准；DSH 身份以 `scripts/dsh-target.mjs` 为准。Contract/preflight 检查读取这两个来源，不再复制版本常量。JSONL writer 使用 `@deepseek-ai/node-addon-system@0.1.2` 平台产物；frozen install 与原生测试必须覆盖完整依赖集合。

## 发布 0.6.0

1. 将发布 PR 合入 `main`，确认已提交的 package version 为 `0.6.0`。
2. 等待这个精确 `main` commit 触发的 **CI** workflow 成功。PR 的 CI 或旧 main commit 的 CI 不能替代本次发布门禁。
3. 打开 **Actions → Publish package → Run workflow**，选择 `main` 并触发。Workflow 的 registry preflight 在目标版本已存在时跳过 npm publish，继续验证产物与通道。
4. 核对 `dsh-multi-tenant@0.6.0`、npm `latest`、Git tag `v0.6.0` 和对应 GitHub Release。npm 版本不可覆盖，修正须使用新版本。
