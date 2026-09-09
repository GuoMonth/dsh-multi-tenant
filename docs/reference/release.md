# Release checks

The release identity is `dsh-multi-tenant@0.5.0` with matching Git tag `v0.5.0`. npm distribution uses the `latest` dist-tag. Its only supported Harness baseline is DSH `0.1.5-alpha.1` at commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`.

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` validates the public surface and exact DSH target, release metadata, peer dependency consistency, type declarations, unit/contract/Web/real-MCP tests, build output, SQLite restart and abandoned-provisioning recovery, lifecycle-abort behavior, secret-leak assertions, and a clean installed-tarball consumer with provider-contract typechecking.

CI repeats the checks on Node 22.19 and Node 24 and separately checks out DSH commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a` to verify the exact `0.1.5-alpha.1` source identity.

Project workflows reject mutable third-party `uses:` references during preflight and pin reviewed actions to full commit SHAs. pnpm enforces a 1,440-minute release-age delay; only exact reviewed DSH packages and their enumerated native addon artifacts are excluded. The official JSONL test backend is dev-only, and its `koffi` install is the only allowed native dependency build besides the explicitly denied redundant `esbuild` postinstall.

These commands do not publish npm, create a Git tag, or create a GitHub Release. The source tag, npm artifact, and GitHub Release are independently verifiable release artifacts.

Distribution remains an explicit manual workflow action and requires a successful CI run for the exact `main` commit being released. The workflow publishes with npm Trusted Publishing and provenance, verifies the registry artifact and `latest` dist-tag, reuses a matching source tag or creates it when absent, and creates a matching GitHub Release. It fails if an existing tag identifies a different commit.

The source version and npm channel come from `packages/multi-tenant/package.json`; the DSH identity comes from `scripts/dsh-target.mjs`. Contract/preflight checks consume those sources instead of maintaining duplicate version constants. The JSONL writer uses `@deepseek-ai/node-addon-system@0.1.2` platform artifacts; frozen installation and native tests must cover the full dependency closure.

## Publishing 0.5.0

1. Merge the release PR into `main`; verify the committed package version is `0.5.0`.
2. Wait for the **CI** workflow triggered by that exact `main` commit to succeed. A PR run or an older main commit does not satisfy the publication gate.
3. Open **Actions → Publish package → Run workflow**, select `main`, and trigger the workflow. Its registry preflight skips npm publication if the exact version already exists, then verifies the artifact and channel.
4. Verify `dsh-multi-tenant@0.5.0`, npm `latest`, Git tag `v0.5.0`, and the matching GitHub Release. npm versions are immutable; a correction requires a new version.
