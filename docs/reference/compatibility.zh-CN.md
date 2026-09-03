# 兼容性

`dsh-multi-tenant@0.4.0-alpha.3` 支持 Node `^22.19.0 || >=24.0.0`，并精确固定 DSH `0.1.2-rc.1`（release source commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`）。DSH peer/dev dependency 都是 exact version，不使用范围。

Alpha.3 是用于集成的预发布版本，对应源码 tag 为 `v0.4.0-alpha.3`，npm 只通过 `alpha` dist-tag 分发。它不承诺 API 稳定，也不得替换 npm `latest` channel。

精确的 [alpha.5 到 RC.1 上游比较](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.2-alpha.5...dsh-v0.1.2-rc.1) 只有两个 release commit，变更全部是 package version metadata。Agent registry/loop、核心 Session、persistence、Session projection、MCP client、Tools 和 API/Web 源码均未变化。即便如此，alpha.3 仍会同时推进全部直接 DSH peer/dev dependency 和源码身份门禁；RC.1 是它唯一支持的 DSH 基线。

此前 alpha.4 到 alpha.5 的源码审查确认了 storage-domain 兼容、JSON storage 和持久化 session-projection cache 的有效变化。这些变化已经进入 RC.1，并继续由 restart 和真实生命周期测试覆盖。

`0.4` 是全新产品线，不承诺与 `0.3` 保持源码、数据或 API 兼容。Session claim、credential、Operation、RuntimeComposition、兼容 facade 和旧 SQLite ownership table 都不会被读取或迁移。

Alpha.2 将 MCP、Secret、runtime-partition 和 DSH driver 契约中的 lifecycle `AbortSignal` 参数改为必填。这是有意的 prerelease 源码破坏：宿主 provider 必须接收 signal，并在可行时合作式响应 shutdown。

支持的公共代码/API 子路径只有 package root、`/mcp`、`/sqlite`、`/web`、`/testing`、`/starter`。此外还为 DSH loader 公开 `./cordis.patch.yml`；它是配置数据，不是 JavaScript API。其余内容都是 private。

CI 会在 Node 22.19 和 Node 24 上执行相同的 typecheck、test、build、SQLite restart probe、原生 DSH AgentLoop/JSONL/官方 MCP 生命周期 integration 和安装后 tarball smoke。生命周期测试不覆盖 Agent factory，也不替换 Session。
