# Repository instructions

Product rules: [CONSTITUTION.md](CONSTITUTION.md). Ownership: [architecture](docs/en/architecture.md). Requirements and acceptance belong to the linked GitHub Issue.

- This is a private pnpm workspace; packages/multi-tenant is publishable. Use manifest-pinned tools and the DSH pin in scripts/dsh-target.mjs.
- Follow nearby TypeScript ESM patterns. Use [development](docs/en/development.md) to choose checks.
- Root READMEs and AI.md are the documentation sources. Build generates package copies with commit-pinned links; do not edit generated copies.
- Preserve access revocation and exact owner/resource identity. Platform secrets and control storage stay outside user domains.
- Keep docs/en and docs/zh-CN paired. Correct both languages when behavior changes, and run pnpm docs:check. Remove superseded documentation; Git and Releases preserve history.

Installation: [guide](docs/en/installation.md). Publication: [releasing](docs/en/releasing.md). Current behavior is defined by public exports and tests.
