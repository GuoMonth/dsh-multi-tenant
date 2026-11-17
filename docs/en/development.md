# Develop DSH multi-tenant

[简体中文](../zh-CN/development.md) · [Guides](index.md)

Use Node 24.11.0 or newer within Node 24, or Node 26 for development. [.node-version](../../.node-version) selects the Node 24 development line. Corepack resolves pnpm from `packageManager`; exact development tools live in the root [package.json](../../package.json) and [pnpm-lock.yaml](../../pnpm-lock.yaml). The engineering baseline is official [DSH 0.2.2-rc.3](https://github.com/deepseek-ai/deepseek-harness/tree/38a6a5c965aa99ab525161efb7cc5cf1fe62fced); it does not change the application's separate [DSH pin](../../scripts/dsh-target.mjs). Installation tests also need Helm 3.

The published application and Connector retain the Node 24.9.0 compatibility floor. The development floor is higher because the official declaration-build closure includes Babel packages requiring Node 24.11.0. Keep strict install checks enabled; run floor compatibility against built artifacts.

```sh
pnpm install --frozen-lockfile
pnpm fmt:check
pnpm lint
pnpm verify
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

TypeScript and JavaScript use two spaces, single quotes, no statement-ending semicolons and trailing commas in multiline lists. TypeScript relative imports use `.ts`; build rewrites emitted imports. `pnpm fmt` applies the pinned Oxlint stylistic fixes; `pnpm fmt:check` checks without writing. Lines over 140 columns need manual wrapping when the rule cannot safely fix them. Source standards check UTF-8, LF, whitespace, JSON and script syntax.

`pnpm lint` runs the official strict TypeScript rules with exact existing-diagnostic allowances in [lint-baseline.json](../../scripts/lint-baseline.json). Each allowance binds a file, rule, owning statement and declaration, and occurrence count. New or relocated diagnostics fail. Once debt is fixed, `pnpm lint --prune` removes resolved allowances; it cannot add them. PR CI compares the baseline against its trusted base commit and rejects growth. Fetch `origin/main` before local linting; `LINT_BASE_REF` may select a trusted base SHA. `pnpm lint:raw` shows all diagnostics, including unresolved debt. `pnpm test:tooling` verifies rejection of new debt, changed owners, increased allowances and hidden style errors.

`pnpm verify` checks source standards, format, lint, tooling tests, documentation, DSH/Connector identities and the environment contract. `scripts/dsh-target.mjs` is the only DSH pin; package `dshRuntime`, the public version constant, Chart `appVersion`, the source manifest and the consumer smoke assertion must match it. `pnpm release:check` adds types, behavior tests, build, a clean installed-package consumer and installation checks. Choose affected checks while editing; run the full command locally for package/release changes.

GitHub pull-request CI runs verification, types and tests on current Node 24 and Node 26. The Node 24.9 compatibility lane installs and builds with Node 24, then switches to Node 24.9 for the clean installed-package consumer with strict npm engine checks. The package smoke and Helm installation gate run on Node 24. The full clean-install acceptance stays local; manual `prepare-release.yml` re-runs `pnpm release:check` before building the candidate.

Root README files and AI.md are the editable sources. Build generates their npm copies with source-commit links. Keep English and Chinese guides paired; update facts, commands and links together. `pnpm docs:check` checks paths, anchors, language pairs and command/version agreement. For cross-repository checks, set `DSH_PLATFORM_DOCS` and `DSH_RUNTIME_DOCS` to the paired checkouts.

Connector fixtures cover platform control and authorization. Real cluster/native application checks use [integration/e2e](../../integration/e2e/README.md), with exact platform/runtime images and private test inputs. Record the tested combination in the PR. See [architecture](architecture.md) for ownership and [releasing](releasing.md) for publication.
