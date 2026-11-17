# 开发 DSH 多租户平台

[English](../en/development.md) · [指南](index.md)

使用 Node 24 系列中不低于 24.9.0 的版本，或 Node 26。[.node-version](../../.node-version) 选择 Node 24 开发线。Corepack 根据 `packageManager` 解析 pnpm；开发工具的精确版本由根 [package.json](../../package.json) 和 [pnpm-lock.yaml](../../pnpm-lock.yaml) 固定。工程基线来自官方 [DSH 0.2.2-rc.3](https://github.com/deepseek-ai/deepseek-harness/tree/38a6a5c965aa99ab525161efb7cc5cf1fe62fced)，应用自身的 [DSH 版本针](../../scripts/dsh-target.mjs) 单独维护。安装测试还需要 Helm 3。

```sh
pnpm install --frozen-lockfile
pnpm fmt:check
pnpm lint
pnpm verify
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

TypeScript 和 JavaScript 使用两空格、单引号、无语句末尾分号，多行列表保留尾逗号。TypeScript 相对导入使用 `.ts`，构建时改写产物导入。`pnpm fmt` 应用固定版本 Oxlint 的风格修复；`pnpm fmt:check` 只检查、不写入。超过 140 列且无法安全自动修复的行需要手动换行。源码规范检查 UTF-8、LF、空白、JSON 和脚本语法。

`pnpm lint` 执行官方严格 TypeScript 规则，存量诊断的精确例外记录在 [lint-baseline.json](../../scripts/lint-baseline.json)。每条例外绑定文件、规则、所属语句和声明，以及出现次数；新增或迁移诊断都会失败。修复债务后运行 `pnpm lint --prune` 删除已解决的例外，该命令不能新增例外。PR CI 对照受信任的基线提交，拒绝扩大例外。本地 lint 前先获取 `origin/main`；`LINT_BASE_REF` 可以指定受信任的基线 SHA。`pnpm lint:raw` 展示包含存量债务的全部诊断。`pnpm test:tooling` 验证新增债务、变更归属、扩大例外和隐藏风格错误都会被拒绝。

`pnpm verify` 检查源码规范、格式、lint、工具测试、文档、DSH/Connector 身份和环境契约。`scripts/dsh-target.mjs` 是唯一 DSH 版本针；包的 `dshRuntime`、公开版本常量、Chart `appVersion`、来源清单和消费 smoke 断言必须一致。`pnpm release:check` 进一步执行类型检查、行为测试、构建、干净安装消费和安装检查。编辑时选择受影响的检查；包或发布变更在本地运行完整命令。

GitHub PR CI 在 Node 24.9、当前 Node 24 和 Node 26 上执行验证、类型检查和测试；包 smoke 与 Helm 安装门禁在 Node 24 上执行。完整干净安装验收保留在本地；手动 `prepare-release.yml` 在构建候选前重新执行 `pnpm release:check`。

根 README 和 AI.md 是可编辑源文件，构建生成带源码提交链接的 npm 副本。中英文指南成对维护，同时更新事实、命令和链接。`pnpm docs:check` 检查路径、锚点、语言配对及命令和版本一致性。跨仓检查可用 `DSH_PLATFORM_DOCS` 和 `DSH_RUNTIME_DOCS` 指定配套 checkout。

Connector fixture 覆盖平台控制与授权。真实集群和原生应用检查使用 [integration/e2e](../../integration/e2e/README.md)，固定平台/runtime 镜像并使用私有测试输入，在 PR 中记录受测组合。职责见[架构](architecture.md)，发布见[发行流程](releasing.md)。
