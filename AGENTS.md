# Repository instructions

[CONSTITUTION.md](CONSTITUTION.md) owns product principles. The Kubernetes-only Agent Workspace contract is tracked in [Issue #104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104); implementation status and acceptance belong to the Issue, not this file.

## Task routing

- Workspace design or breaking changes: [Agent Workspace contract](docs/design/agent-workspace.zh-CN.md). Current Cell implementation/ownership: [S0 architecture](docs/design/s0-runtime-architecture.zh-CN.md); current tested evidence: [regression report](docs/evidence/cell-regression-2026-09-20.md).
- Current installation and pinned versions: [quickstart](docs/reference/quickstart.md) and [package AI guide](packages/multi-tenant/AI.md). Roadmap and task ownership: [POC roadmap](docs/roadmap.md).
- Checks and contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
- Publication: [release runbook](docs/reference/release.md). Publishing, deployment and data deletion require applicable user authorization; routine local edits/checks within the task can proceed.
- Other docs: [index](docs/README.md). Archived plans and standalone/Docker SDK guides are historical evidence, not current installation instructions or requirements. The active path is Envoy TLS/routing → platform `openid-client` OIDC/admission → Node Connector → Go launcher; historical Envoy OIDC/authorizer and standalone flows are not active.

## Repository-specific constraints

- The root is a private pnpm workspace; `packages/multi-tenant` is publishable. Read package manifests for exports/engines/package manager and `scripts/dsh-target.mjs` for the DSH pin.
- Platform identity/control storage/secrets remain outside user domains. DSH owns native Web, sessions, tools and persistence; do not copy its controllers or introduce shared-host per-root ACLs.
- Preserve fail-closed admission/revocation and exact instance ownership. Unknown cleanup must not admit another writer to the same data.
- User-facing changes update both root READMEs and their npm package copies; shipped links must work outside a checkout. Keep the bundled AI guide aligned with actual CLI behavior.
- Follow nearby TypeScript ESM patterns. Current public exports and tests define implemented behavior; use the regression and delivery reports for evidence, not design prose.
