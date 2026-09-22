# Documentation map

Current product: OIDC access to native DSH in Kubernetes Cells. Start with the row that matches the task; archived standalone/SDK plans are not current deployment requirements.

| Task | Current source |
| --- | --- |
| Principles and boundaries | [Constitution](../CONSTITUTION.md) |
| Roadmap and cross-repository ownership | [Three POC slices](roadmap.md) |
| Status / acceptance | [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82), [P2 #99](https://github.com/GuoMonth/dsh-multi-tenant/issues/99), [P3 #100](https://github.com/GuoMonth/dsh-multi-tenant/issues/100) |
| Install the currently published Cell alpha | [Startup](reference/quickstart.md), [中文入口](reference/quickstart.zh-CN.md), [package AI guide](../packages/multi-tenant/AI.md) |
| Product architecture | [POC scope](design/poc-focus.zh-CN.md), [S0 contract](design/s0-runtime-architecture.zh-CN.md), [proxy choice](design/proxy-choice.zh-CN.md) |
| Current implementation | [Assembly](design/r2-platform-assembly.md), [OIDC](design/r4-oidc.md), [allocation](design/r5-allocation.md), [deletion](design/r6-deletion.md) |
| Development / release | [Contributing](../CONTRIBUTING.md), [release runbook](reference/release.md) |
| Evidence for the existing fixed combination | [Core regression](evidence/cell-regression-2026-09-20.md), [prepublication package checks](evidence/alpha-delivery-2026-09-20.md), [repeatable fixtures](../integration/regression/README.md) |
| Upstream version | [DSH baseline](reference/compatibility.md) |

`design/` explains current decisions and implementation; Issues own mutable task state. `releases/` and `evidence/` describe the artifacts and checks at their recorded dates, not every future commit. Published versions remain immutable. P2/P3 planned behavior is not available merely because the roadmap describes it.

Older standalone/Docker and SDK documents live in `archive/`. Use them only for historical versions or source investigations. They do not add macOS, snapshot, migration, HA or old transport/capability tasks to the current POC. Dependency/security defects are tracked separately from product scope.
