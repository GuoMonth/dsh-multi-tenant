# 兼容性

`dsh-multi-tenant@0.4.0-alpha.2` 支持 Node `^22.19.0 || >=24.0.0`，并精确固定 DSH `0.1.2-alpha.5`（release source commit `db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5`）。DSH peer/dev dependency 都是 exact version，不使用范围。

Alpha.2 是用于集成的预发布版本，源码由 `v0.4.0-alpha.2` 标识，npm 只通过 `alpha` dist-tag 分发。它不承诺 API 稳定，也不得替换 npm `latest` channel。

alpha.4 到 alpha.5 的源码审查确认：有效变化集中在 storage-domain 兼容、JSON storage 和持久化 session-projection cache；本项目使用的 Agent registry/loop、核心 Session、MCP client、API/Web 接口和 package entry point 没有语义变化。由于 restart 正确性属于本项目范围，alpha.5 是唯一且最低支持基线。

`0.4` 是全新产品线，不承诺与 `0.3` 保持源码、数据或 API 兼容。Session claim、credential、Operation、RuntimeComposition、兼容 facade 和旧 SQLite ownership table 都不会被读取或迁移。

Alpha.2 将 MCP、Secret、runtime-partition 和 DSH driver 契约中的 lifecycle `AbortSignal` 参数改为必填。这是有意的 prerelease 源码破坏：宿主 provider 必须接收 signal，并在可行时合作式响应 shutdown。

支持的公共代码/API 子路径只有 package root、`/mcp`、`/sqlite`、`/web`、`/testing`、`/starter`。此外还为 DSH loader 公开 `./cordis.patch.yml`；它是配置数据，不是 JavaScript API。其余内容都是 private。

CI 会在 Node 22.19 和 Node 24 上执行相同的 typecheck、test、build、SQLite restart probe、原生 DSH AgentLoop/JSONL/官方 MCP 生命周期 integration 和安装后 tarball smoke。生命周期测试不覆盖 Agent factory，也不替换 Session。
