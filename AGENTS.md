# Repository instructions

Product boundaries: [CONSTITUTION.md](CONSTITUTION.md). Interface and phase design: [AgentEnvironment](docs/design/agent-environment.zh-CN.md); its linked Issues own acceptance and progress. The design is not proof of implementation.

## Development

- Private pnpm workspace; packages/multi-tenant is publishable. Manifests own engines, package manager and exports; scripts/dsh-target.mjs owns the DSH pin.
- Follow nearby TypeScript ESM patterns. Check commands and validation selection: [CONTRIBUTING.md](CONTRIBUTING.md).
- User-facing changes update root READMEs and their package copies; shipped links must work outside the checkout. Keep the bundled AI guide aligned with CLI behavior.
- Preserve fail-closed admission/revocation and exact instance ownership. Platform identity, control storage and secrets remain outside user domains.
- Public exports and tests define implemented behavior. Current Cell implementation: [S0 architecture](docs/design/s0-runtime-architecture.zh-CN.md). Historical standalone and Envoy OIDC/authorizer guides are not active-path requirements.

## References

Installation: [quickstart](docs/reference/quickstart.md) and [package AI guide](packages/multi-tenant/AI.md). Publishing: [release runbook](docs/reference/release.md). Other documents: [index](docs/README.md). Load evidence and archived plans only for the behavior under review.
