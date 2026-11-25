# Repository instructions

Product rules: [CONSTITUTION.md](CONSTITUTION.md). Ownership: [architecture](docs/en/architecture.md). Requirements and acceptance belong to the linked GitHub Issue.

- This is a private pnpm workspace; packages/multi-tenant is publishable. Use manifest-pinned tools and the DSH pin in scripts/dsh-target.ts.
- Use TypeScript ESM with `.ts` relative imports and the pinned Oxlint style. Run `pnpm fmt:check`, `pnpm lint` and the affected checks from [development](docs/en/development.md). Existing lint allowances may only shrink.
- Use Node 24.22.3 or later within 24.x, or Node 26.13.1 or later. Author Node tools and tests in strict TypeScript. Use erasable syntax for direct execution by Node and check it with `pnpm typecheck`.
- Validate external input at its boundary and preserve failure, cancellation and cleanup semantics. Prefer Node built-ins and reuse the pinned dependencies. Keep importable modules free of startup effects.
- Root READMEs and AI.md are the documentation sources. Build generates package copies with commit-pinned links; do not edit generated copies.
- Preserve access revocation and exact owner/resource identity. Platform secrets and control storage stay outside user domains.
- Keep docs/en and docs/zh-CN paired. Correct both languages when behavior changes, and run pnpm docs:check. Remove superseded documentation; Git and Releases preserve history.

Installation: [guide](docs/en/installation.md). Publication: [releasing](docs/en/releasing.md). Current behavior is defined by public exports and tests.
