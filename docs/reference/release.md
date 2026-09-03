# Release checks

The current release identity is `dsh-multi-tenant@0.4.0-alpha.3` with matching Git tag `v0.4.0-alpha.3`. npm distribution uses the `alpha` dist-tag; it must not update `latest`.

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` validates the `0.4` surface and exact DSH target, release metadata, peer dependency consistency, type declarations, unit/contract/Web/real-MCP tests, build output, SQLite restart and abandoned-provisioning recovery, lifecycle-abort behavior, secret-leak assertions, and a clean installed-tarball consumer with provider-contract typechecking.

CI repeats the checks on Node 22.19 and Node 24 and separately checks out DSH commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d` to verify the exact `0.1.2-rc.1` source identity.

Project workflows reject mutable third-party `uses:` references during preflight and pin reviewed actions to full commit SHAs. pnpm enforces a 1,440-minute release-age delay; only exact packages from the reviewed DSH RC.1 source are excluded. The official JSONL test backend is dev-only, and its `koffi` install is the only allowed native dependency build besides the explicitly denied redundant `esbuild` postinstall.

These commands do not publish npm, create a Git tag, or create a GitHub Release. The source tag, npm artifact, and GitHub prerelease are independently verifiable release artifacts.

Distribution remains an explicit manual workflow action and requires a successful CI run for the exact `main` commit being released. The workflow publishes with npm Trusted Publishing and provenance, verifies the registry artifact and `alpha` dist-tag, reuses a matching source tag or creates it when absent, and creates a matching GitHub prerelease. It fails if an existing tag identifies a different commit.
