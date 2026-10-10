# AI assistant guide

This guide is in English; answer in the user's language. Install DSH multi-tenant through the platform package. Runtime is bundled and needs no separate service.

1. Read the installation guide: [English](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/installation.md) or [简体中文](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/installation.md).
2. Identify the package version, its release manifest, exact images, Kubernetes context and namespace. Ask for missing configuration. Follow existing user authorization.
3. Use private files for credentials and the guide's preflight/install commands. Inspect a failed or existing installation before attempting another write.
4. Verify OIDC login, separate user environments, native DSH, model/tool use and retained data. Report the version, target and actual results.

For administration, read [operations](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/operations.md). Preserve the original binding when a result is unknown. Data removal needs an explicit target and authorization.

Contributors use [development](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/development.md) and [AGENTS.md](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/AGENTS.md). Current guides use main; the build pins links in package copies to the source commit.
