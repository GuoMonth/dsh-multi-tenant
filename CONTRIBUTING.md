# Contributing

Product scope lives in [CONSTITUTION.md](CONSTITUTION.md); technical boundaries in [S0](docs/design/s0-runtime-architecture.zh-CN.md). Use [the documentation index](docs/README.md) for task-specific context.

## Validation by changed surface

Use the Node engine and pnpm version in the manifests; install with `pnpm install --frozen-lockfile` when dependencies are needed.

| Change | Relevant check |
| --- | --- |
| Documentation | Links, referenced commands, `git diff --check`; no runtime build solely for prose |
| Package metadata / DSH pin | `node scripts/verify-packages.mjs`, `node scripts/verify-contract.mjs` |
| TypeScript / behavior | Affected package tests and typecheck; scripts in root `package.json` |
| Runtime / CLI / ingress / public API | Relevant installed/native proof; [probe guide](scripts/native-host-probe/README.md) |
| Release preparation | `pnpm release:check`, then [release runbook](docs/reference/release.md) |

`release:check` includes metadata/contract, typecheck, tests, build, SQLite proof and installed tarball SDK smoke; it does not publish. Once relevant checks pass, repeat or broaden only for a new change or unresolved failure.

For native probes, install dependencies in `scripts/native-host-probe` with its frozen lockfile and install Chromium through its Playwright CLI (or use `PROBE_CHROMIUM`). `pnpm probe:isolated` verifies native Hosts. For CLI/image changes, build the image as described in the [AI guide](packages/multi-tenant/AI.md), then run `DSH_EXPERIENCE_IMAGE=sha256:<actual-image-id> node scripts/experience-smoke.mjs`; `pnpm probe:image` checks installed image/network behavior. These checks need local Docker and a browser; Linux evidence does not prove Desktop coverage.

Record the tested commit, relevant commands/results and untested surfaces in the PR. User-facing changes keep root and package READMEs aligned. Publishing uses the authorized manual workflow with a reviewed, locally validated main commit and actual image digest; source, tag and artifact identities must match.
