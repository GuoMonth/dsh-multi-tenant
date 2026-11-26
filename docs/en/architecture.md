# DSH platform architecture

[简体中文](../zh-CN/architecture.md) · [Guides](index.md)

## Components

| Component | Owns |
| --- | --- |
| dsh-multi-tenant | OIDC, membership, authorization, persisted environment bindings, access sessions, HTTP/WebSocket admission, CLI and installation |
| [dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime) | Workload image, launcher, in-process Connector, fixed resources and lifecycle |
| Agent Sandbox core | The sole Pod/Service controller |
| DeepSeek Harness | Native UI, conversations, models, tools and application protocols |

After authorization, the platform calls the single environment adapter selected at startup. The npm package accepts an administrator-provided module. The recommended Kubernetes reference image separately installs the Connector from [dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime). Agent Sandbox reconciles Pods and Services.

## Environment adapter contract

The TypeScript API exports `AgentEnvironmentRuntime`, `EnvironmentAdapterFactory` and `ENVIRONMENT_CONTRACT_VERSION`. Embedded deployments inject a factory into `createPlatformApplication(config, secret, createRuntime)`. The CLI accepts the absolute path `runtime.modulePath` to one trusted ES module. The module exports `contractVersion` and `createRuntime(options, { siteDomain })` and receives `runtime.options`. It runs with platform process privileges. See [direct startup](operations.md#membership-and-platform-restart).

Contract v2 covers allocation, inspection, access, start, stop and deletion. A binding stores the exact owner, allocation key, `instanceId`, `storageId` and optional adapter-owned `locator`. A revision guards updates. An unknown write requires inspection of the original allocation. Restart requires positive proof that the old writer stopped and uses the same storage identity. Deletion retains data. Revocation closes active HTTP streams and WebSockets.

## Identity and storage

OIDC `(issuer, subject)` maps to `(tenantId, principalId)`. The platform stores one binding per owner. The adapter verifies the exact resource identities before access or mutation. The Kubernetes reference adapter represents Sandbox and PVC UIDs as instance and storage identities and checks the current Pod and endpoint for each connection. It can convert legacy v1 bindings in a SQLite transaction, preserving their exact resources and pending operations.

The Kubernetes reference uses one PVC per owner for workspace, HOME and DSH_HOME. Platform state, OIDC secrets and infrastructure credentials remain outside user environments. See the [runtime documentation](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/README.md).

## Sources and validation

- [DSH target](../../scripts/dsh-target.ts): the only DSH npm version and source commit.
- Helm chart [Chart.yaml](../../charts/dsh-platform/Chart.yaml): `version` is the chart revision. `appVersion` is that DSH pin, not the platform npm version.
- [Connector provenance](../../vendor/environment-connector.json): source commit and tarball integrity.
- [Installation asset sources](../../charts/dsh-platform/files/sources.json): controller, runtime RBAC and the copied DSH pin.
- [Release validation](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.11.0-rc.1/validation.md): actual images, two-user/model/tool checks and limits.

[Product principles](../../CONSTITUTION.md) set the shared boundaries. [Operations](operations.md) explains user-visible data and lifecycle behavior.
