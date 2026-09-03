# Compatibility

`dsh-multi-tenant@0.4.0-alpha.1` targets Node `^22.19.0 || >=24.0.0` and exactly DSH `0.1.2-alpha.5` (release source commit `db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5`). Its DSH peer and development dependencies are exact, not ranges.

The alpha.4-to-alpha.5 source review found functional changes in storage-domain compatibility, JSON storage, and persisted session-projection cache handling. The Agent registry/loop, core Session, MCP client, API/Web surfaces used here, and package entry points had no semantic API change. Because restart correctness is in scope, alpha.5 is the minimum and only supported DSH baseline.

`0.4` is a clean product line. It has no source, data, or API compatibility promise with `0.3`: Session claims, credentials, Operations, RuntimeComposition, compatibility facades, and the old SQLite ownership table are not read or migrated.

Supported public code/API subpaths are the package root, `/mcp`, `/sqlite`, `/web`, `/testing`, and `/starter`. `./cordis.patch.yml` is additionally exported for the DSH loader; it is configuration data rather than a JavaScript API. Anything else is private.

Node 22.19 and Node 24 run the same typecheck, tests, build, SQLite restart probe, native DSH AgentLoop/JSONL/official-MCP lifecycle integration, and installed-tarball smoke in CI. The lifecycle test does not override the Agent factory or substitute a Session.
