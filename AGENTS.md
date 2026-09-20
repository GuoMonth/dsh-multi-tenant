# Repository instructions

[CONSTITUTION.md](CONSTITUTION.md) owns product principles. Current work is the Cell MVP in [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82); implementation status and acceptance belong to the Issue, not this file.

## Task routing

- Cell integration or ownership: [S0 architecture](docs/design/s0-runtime-architecture.zh-CN.md).
- Cell CLI usage or source map: [package AI guide](packages/multi-tenant/AI.md).
- Checks and contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
- Publication: [release runbook](docs/reference/release.md). Publishing, deployment and data deletion require applicable user authorization; routine local edits/checks within the task can proceed.
- Other docs: [index](docs/README.md). Archived plans are evidence, not current requirements.

## Repository-specific constraints

- The root is a private pnpm workspace; `packages/multi-tenant` is publishable. Read package manifests for exports/engines/package manager and `scripts/dsh-target.mjs` for the DSH pin.
- Platform identity/control storage/secrets remain outside user domains. DSH owns native Web, sessions, tools and persistence; do not copy its controllers or introduce shared-host per-root ACLs.
- Preserve fail-closed admission/revocation and exact instance ownership. Unknown cleanup must not admit another writer to the same data.
- User-facing changes update both root READMEs and their npm package copies; shipped links must work outside a checkout. Keep the bundled AI guide aligned with actual CLI behavior.
- Follow nearby TypeScript ESM patterns. Current public exports and tests define implemented behavior; use the regression and delivery reports for evidence, not design prose.
