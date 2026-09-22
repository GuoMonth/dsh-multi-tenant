# Documentation map

Direction: Kubernetes-only Agent Workspace. Current implementation and published artifacts still use Cell; the next contract is not an implementation claim. Start with the row that matches the task; archived standalone/SDK plans are not current deployment requirements.

| Task | Current source |
| --- | --- |
| Principles and boundaries | [Constitution](../CONSTITUTION.md) |
| Roadmap and cross-repository ownership | [W1–W3 slices](roadmap.md) |
| Status / acceptance | [Issue #104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104); completed Cell baseline: [#82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82) |
| Install the currently published Cell alpha | [Startup](reference/quickstart.md), [中文入口](reference/quickstart.zh-CN.md), [package AI guide](../packages/multi-tenant/AI.md) |
| Product architecture | [Agent Workspace contract](design/agent-workspace.zh-CN.md), [adversarial review](evidence/agent-workspace-review-2026-09-22.md), current Cell [S0 implementation boundary](design/s0-runtime-architecture.zh-CN.md), [proxy choice](design/proxy-choice.zh-CN.md) |
| Current implementation | [Assembly](design/r2-platform-assembly.md), [OIDC](design/r4-oidc.md), [allocation](design/r5-allocation.md), [deletion](design/r6-deletion.md) |
| Development / release | [Contributing](../CONTRIBUTING.md), [release runbook](reference/release.md) |
| Evidence for the existing fixed combination | [Core regression](evidence/cell-regression-2026-09-20.md), [prepublication package checks](evidence/alpha-delivery-2026-09-20.md), [repeatable fixtures](../integration/regression/README.md) |
| Upstream version | [Pinned DSH source](../scripts/dsh-target.mjs) |

`design/` explains current decisions and implementation; Issues own mutable task state. `releases/` and `evidence/` describe the artifacts and checks at their recorded dates, not every future commit. Published versions remain immutable. The fixed-template candidate has a separate [2026-09-22 acceptance record](evidence/cell-mvp-2026-09-22.md); it does not change the previously published artifacts.

Older standalone/Docker and SDK documents live in `archive/` (including the [SDK compatibility history](archive/legacy-sdk/compatibility.md)). Use them only for historical versions or source investigations. They do not add macOS, snapshot, migration, HA or old transport/capability tasks to the current POC. Dependency/security defects are tracked separately from product scope.
