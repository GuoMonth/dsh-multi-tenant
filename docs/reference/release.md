# Release checks

The reviewed source release is `dsh-multi-tenant@0.4.0-alpha.2`, identified by Git tag `v0.4.0-alpha.2`. npm distribution uses the `alpha` dist-tag; it must not update `latest`.

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` validates the `0.4` surface and exact DSH target, release metadata, peer dependency consistency, type declarations, unit/contract/Web/real-MCP tests, build output, SQLite restart and abandoned-provisioning recovery, lifecycle-abort behavior, secret-leak assertions, and a clean installed-tarball consumer with provider-contract typechecking.

CI repeats the checks on Node 22.19 and Node 24 and separately checks out DSH commit `db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5` to verify source identity.

Project workflows reject mutable third-party `uses:` references during preflight and pin reviewed actions to full commit SHAs. pnpm enforces a 1,440-minute release-age delay; only exact packages from the reviewed DSH alpha.5 source are excluded. The official JSONL test backend is dev-only, and its `koffi` install is the only allowed native dependency build besides the explicitly denied redundant `esbuild` postinstall.

These commands do not publish npm, create a Git tag, or create a GitHub Release. The source tag, npm artifact, and GitHub prerelease are independently verifiable release artifacts.

Distribution remains an explicit manual workflow action and requires a successful CI run for the exact `main` commit being released. The workflow publishes with npm Trusted Publishing and provenance, verifies the registry artifact and `alpha` dist-tag, reuses a matching source tag or creates it when absent, and creates a matching GitHub prerelease. It fails if an existing tag identifies a different commit.
