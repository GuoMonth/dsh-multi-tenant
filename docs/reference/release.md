# Release checks

The release candidate is `dsh-multi-tenant@0.4.0-alpha.1` on npm tag `alpha`.

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` validates the `0.4` surface and exact DSH target, release metadata, peer dependency consistency, type declarations, unit/contract/Web/real-MCP tests, build output, cross-process SQLite restart, secret-leak assertions, and a clean installed-tarball consumer.

CI repeats the checks on Node 22.19 and Node 24 and separately checks out DSH commit `4e84901e6471b79ec0338099867ebb4606d12bb5` to verify source identity.

These commands do not publish npm or create a GitHub Release. Publication remains an explicit manual workflow action and requires a successful CI run for the exact `main` commit being released.
