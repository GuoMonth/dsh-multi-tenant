# Documentation map

The current source candidate is Kubernetes-only AgentEnvironment on DSH RC2. Acceptance and mutable progress belong to [MVP #104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104); a source change or local fixture does not prove combined deployment.

| Task | Source |
| --- | --- |
| Principles | [Constitution](../CONSTITUTION.md) |
| Candidate operation | [English README](../README.md), [中文 README](../README.zh-CN.md), [quickstart](reference/quickstart.md), [AI guide](../packages/multi-tenant/AI.md) |
| Implementation waves and ownership | [MVP plan](plans/mvp-rc2.zh-CN.md) |
| Architecture direction | [AgentEnvironment](design/agent-environment.zh-CN.md) |
| Platform implementation | [Bindings](../packages/multi-tenant/src/platform/bindings.ts), [control](../packages/multi-tenant/src/platform/control.ts), [OIDC](../packages/multi-tenant/src/platform/oidc.ts) |
| Development and publication boundary | [Contributing](../CONTRIBUTING.md), [release runbook](reference/release.md) |
| Exact dependency identities | [DSH pin](../scripts/dsh-target.mjs), [connector pin](../vendor/environment-connector.json) |

Cell/S0, r2–r6, old standalone/Docker and published-release records describe their dated versions only. They are not current executable paths, installation requirements, or proof that RC2 has passed E2E. Keep those historical artifacts immutable; no migration or old-Alpha export project is part of this candidate.
