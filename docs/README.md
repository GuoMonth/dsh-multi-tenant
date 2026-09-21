# Documentation map

Read only the row relevant to the task. Current entry is the Cell alpha; historical SDK/workbench documents live in archive/.

| Task | Source |
| --- | --- |
| POC scope / next three slices | [POC focus](design/poc-focus.zh-CN.md) |
| Product principles | [Constitution](../CONSTITUTION.md) |
| Current work / acceptance | [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82) |
| Platform source assembly | [Private platform app](design/r2-platform-assembly.md) |
| Proxy scope / alternatives | [POC proxy assessment](design/proxy-choice.zh-CN.md) |
| Cell contract | [S0](design/s0-runtime-architecture.zh-CN.md), [research](design/s0-references.zh-CN.md) |
| Cell CLI / alpha startup | [Bundled AI guide](../packages/multi-tenant/AI.md), [quickstart](reference/quickstart.md) |
| Checks | [Contributing](../CONTRIBUTING.md) |
| Publishing | [Release runbook](reference/release.md) |
| Existing DSH baseline | [Compatibility evidence](reference/compatibility.md) |

Old assessments and plans live in `archive/`; release records in `releases/`; captured verification in `evidence/`. They describe their recorded revisions, not current obligations. Search them only for a specific historical question. Keep product principles in the constitution, task status in Issues, commands in executable manifests/runbooks; avoid copies of each in agent instructions.

This routing follows OpenAI's [GPT-6 Astra guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) and [skill guidance](https://learn.chatgpt.com/docs/build-skills), reviewed 2026-09-20: narrow context, task-specific entry points, minimal procedural scaffolding. These sources inform documentation structure, not product requirements or a required model configuration.

- [R4 OIDC and environment sessions](design/r4-oidc.md): source configuration and revocation; current results in the regression report.

- [R5 创建、查询与分配状态](design/r5-allocation.md)：当前配置、状态屏障和集中回归清单。

- [R6 管理删除与集中回归](design/r6-deletion.md)：私有管理员入口、删除屏障及回归启动点。

- [Cell 集中回归](../integration/regression/README.md)：任务专属环境、执行顺序及证据边界。

- [Alpha delivery](reference/quickstart.md) / [packaging evidence](evidence/alpha-delivery-2026-09-20.md).
