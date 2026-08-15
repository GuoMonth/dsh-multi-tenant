# Compatibility & versioning policy

## Runtime

- **Node** `>= 22.19` (matches DeepSeek Harness engines).
- **Cordis** `@deepseek-ai/cordis` `>= 4.0.1 < 5` (peer).

## DSH prerelease pinning

DeepSeek Harness sub-packages publish a stale `latest` dist-tag (`0.0.1-rc.1`)
while the newest published version is `0.1.0-rc.6`. **Never depend on
`latest`** — pin an explicit prerelease version (e.g. `…@0.1.0-rc.6`), and
record the DSH commit SHA a package's types were verified against (see
`packages/multi-tenant-web/SEAM-MAP.md`).

## Toolchain

- **pnpm** `>= 11` (build-script policy lives in `pnpm-workspace.yaml`).
- **TypeScript** `>= 6.0` (build baseline; `tsconfig.base.json`).

## Kernel invariant

The kernel depends on Cordis only — no transport/vendor runtime dependencies
(JWT / PostgreSQL / HTTP / MCP / Redis). Enforced by
`scripts/verify-packages.mjs` (CI gate), not by convention.
