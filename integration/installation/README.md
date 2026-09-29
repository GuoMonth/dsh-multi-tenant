# Installation checks

Run from the repository root with Node 24 and Helm 3:

```sh
node --test integration/installation/verify.test.mjs
helm lint charts/dsh-platform --values integration/installation/fixture.values.json --strict
node charts/install.mjs render --values integration/installation/fixture.values.json --namespace dsh-install-fixture
```

The fixture is deliberately nondeployable. Tests render the real Helm chart and check
configuration, secret references, retained control storage, fixed asset hashes, approved
runtime RBAC, and invalid inputs; they do not launch the platform or fake a Kubernetes runtime.
The installer rejects fixture values before any Kubernetes call. No package manifest changes
or additional dependencies are required.

See [the installation draft](../../docs/installation/README.zh-CN.md) for actual prerequisites,
one installation entry and the remaining G2/E acceptance. C owns root/package documentation;
E links this path from the final user guides when the actual candidate is verified.
