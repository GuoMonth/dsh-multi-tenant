# 0.12.0

[简体中文](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/release-notes.md)

The reference deployment pairs platform **0.12.0** with `dsh-isolated-runtime` **0.5.0** and DSH **0.2.2-rc.5**. The platform and runtime use the same upstream DSH commit. [DSH source](https://github.com/deepseek-ai/deepseek-harness/tree/9c2670d3bce5275e0d1610272958121af87787bb)

- The platform owns OIDC, authorization and environment bindings. It loads one trusted runtime adapter at startup through `runtime.modulePath`, or accepts an adapter factory through its embedding API.
- Environment contract v2 uses exact instance and storage identities issued by the adapter. The binding migration retains the owner, allocation key, original resource identities and pending operations.
- The Kubernetes reference image installs the pinned Connector separately. It uses `dsh-isolated-runtime` as the recommended runtime. Source deployments migrating their configuration put runtime-specific settings under `runtime.options` and select the adapter through `runtime.modulePath`.

Reference qualification covers fresh Linux/amd64 installations on a single Kubernetes node with one platform replica and a fixture OIDC provider. The test report records cold-start login, two-user access and revocation, native HTTP and WebSocket access, real model and authorized CLI calls, external MCP TLS with Bearer credentials, and same-volume retention through stop/start and Pod recreation. In-place upgrades, enterprise SSO, high availability and production capacity are outside that scope. [External MCP OAuth tracking](https://github.com/GuoMonth/dsh-isolated-runtime/issues/127) [Release procedure](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/releasing.md)

Once published, install the exact version with `npm install --global dsh-multi-tenant@0.12.0` and use the image digests in its GitHub Release. [Installation guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/installation.md)
