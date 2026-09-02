# Compatibility

`dsh-multi-tenant@0.4.0-alpha.1` targets Node `^22.19.0 || >=24.0.0` and exactly DSH `0.1.2-alpha.4` (release source commit `4e84901e6471b79ec0338099867ebb4606d12bb5`). Its DSH peer and development dependencies are exact, not ranges.

`0.4` is a clean product line. It has no source, data, or API compatibility promise with `0.3`: Session claims, credentials, Operations, RuntimeComposition, compatibility facades, and the old SQLite ownership table are not read or migrated.

Supported public subpaths are the package root, `/mcp`, `/sqlite`, `/web`, `/testing`, and `/starter`. Anything else is private.

Node 22.19 and Node 24 run the same typecheck, tests, build, SQLite restart probe, DSH AgentRegistry/official MCP seam integration, and installed-tarball smoke in CI. A full native DSH Agent/session lifecycle test without an overridden Agent factory is a pre-publication requirement tracked by [#45](https://github.com/GuoMonth/dsh-multi-tenant/issues/45).
