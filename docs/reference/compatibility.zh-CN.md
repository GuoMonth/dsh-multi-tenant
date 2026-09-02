# 兼容性

`dsh-multi-tenant@0.4.0-alpha.1` 支持 Node `^22.19.0 || >=24.0.0`，并精确固定 DSH `0.1.2-alpha.4`（release source commit `4e84901e6471b79ec0338099867ebb4606d12bb5`）。DSH peer/dev dependency 都是 exact version，不使用范围。

`0.4` 是全新产品线，不承诺与 `0.3` 保持源码、数据或 API 兼容。Session claim、credential、Operation、RuntimeComposition、兼容 facade 和旧 SQLite ownership table 都不会被读取或迁移。

支持的公共子路径只有 package root、`/mcp`、`/sqlite`、`/web`、`/testing`、`/starter`；其余内容都是 private。

CI 会在 Node 22.19 和 Node 24 上执行相同的 typecheck、test、build、SQLite restart probe、真实 DSH/MCP integration 和安装后 tarball smoke。
