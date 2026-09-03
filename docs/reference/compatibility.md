# Compatibility

`dsh-multi-tenant@0.4.0` targets Node `^22.19.0 || >=24.0.0` and exactly DSH `0.1.2-rc.1` (release source commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`). Its DSH peer and development dependencies are exact, not ranges.

`0.4.0` is the first non-prerelease distribution of this plugin's clean public surface, with matching source tag `v0.4.0` and npm `latest` dist-tag. It is not a `1.0`-level indefinite compatibility promise; incompatible changes must be explicitly versioned and documented. DSH `0.1.2-rc.1` is still an upstream release candidate: the plugin release does not relabel DSH or imply compatibility with later DSH prereleases. Exact DSH upgrades are reviewed and released explicitly.

The exact [alpha.5-to-RC.1 upstream comparison](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.2-alpha.5...dsh-v0.1.2-rc.1) contains two release commits and only package-version metadata changes. Agent registry/loop, core Session, persistence, Session projection, MCP client, Tools, and API/Web source are unchanged. Even so, `0.4.0` advances every direct DSH peer/development dependency and the source-identity gate together; RC.1 is its only supported DSH baseline.

The earlier alpha.4-to-alpha.5 review found functional changes in storage-domain compatibility, JSON storage, and persisted session-projection cache handling. Those changes remain part of RC.1 and continue to be exercised by restart and real lifecycle tests.

`0.4` is a clean product line. It has no source, data, or API compatibility promise with `0.3`: Session claims, credentials, Operations, RuntimeComposition, compatibility facades, and the old SQLite ownership table are not read or migrated.

The lifecycle `AbortSignal` arguments on MCP, Secret, runtime-partition, and DSH driver contracts are required. Host providers must accept the signal and cooperate with shutdown where possible.

Supported public code/API subpaths are the package root, `/mcp`, `/sqlite`, `/web`, `/testing`, and `/starter`. `./cordis.patch.yml` is additionally exported for the DSH loader; it is configuration data rather than a JavaScript API. Anything else is private.

Node 22.19 and Node 24 run the same typecheck, tests, build, SQLite restart probe, native DSH AgentLoop/JSONL/official-MCP lifecycle integration, and installed-tarball smoke in CI. The lifecycle test does not override the Agent factory or substitute a Session.
