# Contributing

Follow [CONSTITUTION.md](CONSTITUTION.md) and the active [MVP plan](docs/plans/mvp-rc2.zh-CN.md). The [release procedure](docs/reference/release.md) governs verified publication. The package manifest pins Node/pnpm and scripts/dsh-target.mjs pins DSH.

`pnpm install --frozen-lockfile` installs development dependencies. `pnpm release:check` runs metadata/pin validation, TypeScript, platform tests, build and clean installed-tarball smoke without publishing. Use the relevant subset while iterating. No legacy backend matrix is supported.

The platform and connector are separate owners. Tests using a connector fixture prove platform control/authorization behavior only. Cluster/native proxy/DSH and actual model/tool acceptance need the exact runtime/platform/installation candidates in #106. Do not claim published availability or joint E2E from a local build.

Keep both root READMEs and their package copies identical, update the bundled AI guide with CLI behavior, and use hosted links in shipped documentation. Record actual commands/results and untested surfaces in the PR. Never print or commit credentials.
