# Installation checks (English)

From the repository root with Node 24.22.3 or later in 24.x, or 26.13.1 or later, and Helm 3:

```sh
pnpm install --frozen-lockfile
node --test integration/installation/verify.test.ts
helm lint charts/dsh-platform --values integration/installation/fixture.values.json --strict
node charts/install.ts render --values integration/installation/fixture.values.json --namespace dsh-install-fixture
```

Tests render the real chart and check configuration, Secret references, retained control storage, asset hashes, runtime RBAC and invalid inputs. Fixture values are deliberately rejected by live installation.

For deployment, use [installation](../../docs/en/installation.md) ([简体中文](../../docs/zh-CN/installation.md)). Real cluster tests use [integration/e2e](../e2e/README.md).
