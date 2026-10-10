# Installation checks (English)

From the repository root with Node 24 and Helm 3:

```sh
node --test integration/installation/verify.test.mjs
helm lint charts/dsh-platform --values integration/installation/fixture.values.json --strict
node charts/install.mjs render --values integration/installation/fixture.values.json --namespace dsh-install-fixture
```

Tests render the real chart and check configuration, Secret references, retained control storage, asset hashes, runtime RBAC and invalid inputs. Fixture values are deliberately rejected by live installation.

For deployment, use [installation](../../docs/en/installation.md) ([简体中文](../../docs/zh-CN/installation.md)). Real cluster tests use [integration/e2e](../e2e/README.md).
