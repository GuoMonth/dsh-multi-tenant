# Develop DSH multi-tenant

[简体中文](../zh-CN/development.md) · [Guides](index.md)

Use Node 24 or 26 as declared by [.node-version](../../.node-version) and `engines`. Corepack resolves the pnpm version from `packageManager` in [package.json](../../package.json). Installation tests also need Helm 3.

```sh
pnpm install --frozen-lockfile
pnpm docs:check
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

`pnpm verify` checks DSH/Connector identities and the environment contract. `pnpm release:check` runs those checks plus documentation, types, tests, build, a clean installed-package consumer and installation checks. Choose the affected checks while editing; run the full command locally for package/release changes. GitHub pull-request CI runs only `pnpm verify`, `pnpm typecheck` and `pnpm test` on Node 24 and 26; it does not repeat the heavy acceptance on free runners.

Root README files and AI.md are the editable sources. Build generates their npm copies, pinning hosted links to the source commit. Keep English and Chinese guides paired; update facts, commands and links in the same PR. `docs:check` checks paths, anchors, language pairs and command/version agreement. For cross-repository checks, set `DSH_PLATFORM_DOCS` and `DSH_RUNTIME_DOCS` to the paired checkouts.

Tests with a Connector fixture cover platform control and authorization. Real cluster/native application checks use [integration/e2e](../../integration/e2e/README.md), with exact platform/runtime images and private test inputs. Record the tested combination in the PR. See [architecture](architecture.md) for ownership and [releasing](releasing.md) for publication.
