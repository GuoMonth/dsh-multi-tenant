# Compatibility

`dsh-multi-tenant@0.4.0-alpha.3` targets Node `^22.19.0 || >=24.0.0` and exactly DSH `0.1.2-rc.1` (release source commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`). Its DSH peer and development dependencies are exact, not ranges.

Alpha.3 is an integration prerelease with matching source tag `v0.4.0-alpha.3`, distributed on npm only through the `alpha` dist-tag. It does not claim API stability and must not replace the npm `latest` channel.

The exact [alpha.5-to-RC.1 upstream comparison](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.2-alpha.5...dsh-v0.1.2-rc.1) contains two release commits and only package-version metadata changes. Agent registry/loop, core Session, persistence, Session projection, MCP client, Tools, and API/Web source are unchanged. Even so, alpha.3 advances every direct DSH peer/development dependency and the source-identity gate together; RC.1 is its only supported DSH baseline.

The earlier alpha.4-to-alpha.5 review found functional changes in storage-domain compatibility, JSON storage, and persisted session-projection cache handling. Those changes remain part of RC.1 and continue to be exercised by restart and real lifecycle tests.

`0.4` is a clean product line. It has no source, data, or API compatibility promise with `0.3`: Session claims, credentials, Operations, RuntimeComposition, compatibility facades, and the old SQLite ownership table are not read or migrated.

Alpha.2 makes the lifecycle `AbortSignal` arguments on MCP, Secret, runtime-partition, and DSH driver contracts required. This is an intentional prerelease source break: host providers must accept the signal and cooperate with shutdown where possible.

Supported public code/API subpaths are the package root, `/mcp`, `/sqlite`, `/web`, `/testing`, and `/starter`. `./cordis.patch.yml` is additionally exported for the DSH loader; it is configuration data rather than a JavaScript API. Anything else is private.

Node 22.19 and Node 24 run the same typecheck, tests, build, SQLite restart probe, native DSH AgentLoop/JSONL/official-MCP lifecycle integration, and installed-tarball smoke in CI. The lifecycle test does not override the Agent factory or substitute a Session.
