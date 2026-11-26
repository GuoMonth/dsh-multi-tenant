# Develop DSH multi-tenant

[简体中文](../zh-CN/development.md) · [Guides](index.md)

Use Node 24.22.3 or later within 24.x, or Node 26.13.1 or later, for development and package consumption. [.node-version](../../.node-version) pins the development version. Corepack resolves pnpm from `packageManager`. The root [package.json](../../package.json) and [pnpm-lock.yaml](../../pnpm-lock.yaml) fix development tools. Install Helm 3 for installation tests.

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

Root `tsconfig.json` checks tooling, installation and qualification tests with strict types and erasable syntax for direct Node execution. Use Node built-ins for process and I/O, and validate external inputs at the boundary. Build emits `charts/install.mjs` for the installed CLI. The shared documentation checker uses plain JavaScript.

`pnpm lint` runs the official strict TypeScript rules with exact existing-diagnostic allowances in [lint-baseline.json](../../scripts/lint-baseline.json). Each allowance binds a file, rule, owning statement and declaration, and occurrence count. New or relocated diagnostics fail. Once debt is fixed, `pnpm lint --prune` removes resolved allowances; it cannot add them. PR CI compares the baseline against its trusted base commit and rejects growth. Fetch `origin/main` before local linting; `LINT_BASE_REF` may select a trusted base SHA. `pnpm lint:raw` shows all diagnostics, including unresolved debt. `pnpm test:tooling` verifies rejection of new debt, changed owners, increased allowances and hidden style errors.

`pnpm verify` checks source standards, format, lint, tooling tests, documentation, the reference DSH pin and the environment contract. `scripts/dsh-target.ts` is the only DSH pin; package `dshRuntime`, the public version constant, Chart `appVersion`, the source manifest and the consumer smoke assertion must match it. `pnpm release:check` adds types, behavior tests, build, a clean installed-package consumer and installation checks. Choose affected checks while editing; run the full command locally for package/release changes.

GitHub pull-request CI verifies, type-checks, tests and runs clean installation checks on Node 24.22.3 and 26.13.1 with strict engine checks. Manual `prepare-release.yml` re-runs `pnpm release:check` before building the candidate.

Root README files and AI.md are the editable sources. Build generates their npm copies with source-commit links. Keep English and Chinese guides paired; update facts, commands and links together. `pnpm docs:check` checks paths, anchors, language pairs and command/version agreement. For cross-repository checks, set `DSH_PLATFORM_DOCS` and `DSH_RUNTIME_DOCS` to the paired checkouts.

The reference deployment for the next candidate targets official [DSH 0.2.2-rc.5](https://github.com/deepseek-ai/deepseek-harness/tree/9c2670d3bce5275e0d1610272958121af87787bb). The platform can be reviewed and tested independently. Qualification of the reference deployment uses a workload image built from the same DSH pin. The [installation guide](installation.md) covers the published combination.

The DSH web profile owns UI, Session/settings storage, plugin composition, worktrees and agent capabilities. The platform keeps organization identity, access revocation and environment bindings. Prefer supported profiles and patches over a parallel application implementation. Runtime's [compatibility choices](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/compat/dsh/README.md) identify the removed private Node flag and the retained OIDC cookie/deployment adapters. Fresh-install and same-version restart checks do not establish an old-data migration path.

Owner, allocation, environment, resource UID and revision roles use distinct types. The SDK exports identity parsers for external values; wire strings and the owner-to-environment hash stay exact. Configuration and persisted bindings are schema-checked, including owner/ref consistency and mutation barriers. A malformed binding blocks subsequent writes until private state is inspected; it never authorizes a replacement allocation. Connector Kubernetes parsing preserves unexpected fields for template rejection.

Shutdown is idempotent: stop admissions and abort connections, await startup, membership reload and actual in-flight authentication/runtime/admin work, then dispose sessions and SQLite. Cancellation alone is not completion. Partial startup failures run the same cleanup, and cleanup failures produce a fixed diagnostic without raw dependency data. SIGHUP admits only membership; a failed live reload revokes sessions, while a cancelled reload cannot install membership after shutdown.

Platform behavior tests inject adapters through the [environment contract](architecture.md#environment-adapter-contract). They exercise control, authorization, recovery and transport without building a runtime or running Kubernetes. The installed package smoke starts with a fixture adapter without the Connector. Reference image preparation verifies the Connector archive separately. Real cluster and native application checks use [integration/e2e](../../integration/e2e/README.md), with exact platform/runtime images and private test inputs. Record the tested combination in the PR. See [releasing](releasing.md) for publication.

SDK dependency review updates openid-client to 6.9.0, ws to 8.23.0 and Zod to 4.6.7; the Connector is repacked from its committed source. Vitest 4.1.12 and Vite 8.2.6/source-map-js 1.2.2 security pins fix the audited development closure while keeping the official DSH TypeScript/lint toolchain. `pnpm security` runs `pnpm audit` in the verification gate for this workspace closure; the official native DSH distribution remains separately locked by runtime.
