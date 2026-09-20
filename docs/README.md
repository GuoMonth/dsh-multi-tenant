# Documentation map

Read only the row relevant to the task. Current implementation and planned Cell integration are distinct.

| Task | Source |
| --- | --- |
| Product principles | [Constitution](../CONSTITUTION.md) |
| Current work / acceptance | [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82) |
| Cell integration design (not implemented) | [S0](design/s0-runtime-architecture.zh-CN.md), [research](design/s0-references.zh-CN.md) |
| Existing SDK / CLI | [Bundled AI guide](../packages/multi-tenant/AI.md), [quickstart](reference/quickstart.md) |
| Checks | [Contributing](../CONTRIBUTING.md) |
| Publishing | [Release runbook](reference/release.md) |
| Existing DSH baseline | [Compatibility evidence](reference/compatibility.md) |

Old assessments and plans live in `archive/`; release records in `releases/`; captured verification in `evidence/`. They describe their recorded revisions, not current obligations. Search them only for a specific historical question. Keep product principles in the constitution, task status in Issues, commands in executable manifests/runbooks; avoid copies of each in agent instructions.

This routing follows OpenAI's [GPT-6 Astra guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) and [skill guidance](https://learn.chatgpt.com/docs/build-skills), reviewed 2026-09-20: narrow context, task-specific entry points, minimal procedural scaffolding. These sources inform documentation structure, not product requirements or a required model configuration.
