# 发布检查

当前候选版本是 npm `alpha` tag 下的 `dsh-multi-tenant@0.4.0-alpha.1`。

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` 会验证 `0.4` 公共面和精确 DSH target、release metadata、peer dependency 一致性、类型声明、unit/contract/Web/真实 MCP 测试、build 产物、跨进程 SQLite restart、Secret 泄漏探针，以及全新安装 tarball 的 consumer。

CI 在 Node 22.19 和 Node 24 上重复执行，并单独 checkout DSH commit `4e84901e6471b79ec0338099867ebb4606d12bb5` 核对源码身份。

这些命令不会发布 npm 或创建 GitHub Release。发布必须显式手动触发 workflow，并要求待发布的精确 `main` commit 已有成功的 CI 结果。
