# 开发 DSH multi-tenant

[English](../en/development.md) · [文档目录](index.md)

使用 [.node-version](../../.node-version) 和 `engines` 声明的 Node 24 或 26；pnpm 版本由 [package.json](../../package.json) 的 `packageManager` 固定，并通过 Corepack 解析。安装测试另需 Helm 3。

```sh
pnpm install --frozen-lockfile
pnpm docs:check
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

`pnpm verify` 检查 DSH/Connector 身份和环境契约。`pnpm release:check` 还运行文档、类型、测试、构建、干净安装包消费和安装检查。编辑时选择受影响的检查；包或发行变更在本地运行完整命令。GitHub PR CI 在 Node 24 和 26 上运行 `pnpm verify`、`pnpm typecheck`、`pnpm test`，并在 Node 24 上运行包 smoke 与 Helm 安装检查；完整 clean-install 验收留在本地，手动 `prepare-release.yml` 在构建候选前重跑 `pnpm release:check`。

根目录 README 和 AI.md 是编辑源。构建生成 npm 副本，并将链接固定到源码提交。中英文指南成对维护，事实、命令和链接在同一 PR 中更新。`docs:check` 检查路径、锚点、语言配对及命令/版本一致性。跨仓库检查时，将 `DSH_PLATFORM_DOCS` 和 `DSH_RUNTIME_DOCS` 设置为配套工作区路径。

Connector 夹具测试覆盖平台控制与授权。真实集群和原生应用检查使用 [integration/e2e（英文）](../../integration/e2e/README.md)，固定平台/runtime 镜像，测试输入放在私有文件中。PR 记录受测组合。分工见[架构](architecture.md)，发行见[发布指南](releasing.md)。
