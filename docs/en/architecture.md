# DSH platform architecture

[简体中文](../zh-CN/architecture.md) · [Guides](index.md)

## Components

| Component | Owns |
| --- | --- |
| dsh-multi-tenant | OIDC, membership, authorization, persisted environment bindings, access sessions, HTTP/WebSocket admission, CLI and installation |
| [dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime) | Workload image, launcher, in-process Connector, fixed resources and lifecycle |
| Agent Sandbox core | The sole Pod/Service controller |
| DeepSeek Harness | Native UI, conversations, models, tools and application protocols |

The platform calls an environment adapter after authorization. The CLI wires in the bundled Kubernetes Connector as the reference adapter. It verifies exact resources and forwards native traffic. DSH runs in each user's Pod, and Kubernetes reconciles the Sandbox.

## Environment adapter contract

The public TypeScript API exports `AgentEnvironmentRuntime` and `ENVIRONMENT_CONTRACT_VERSION`. Use `parsePlatformConfiguration` and pass an adapter factory to `createPlatformApplication(config, secret, createRuntime)` to compose the platform independently. The CLI also validates its Kubernetes-specific `runtime` configuration. The DSH pin identifies the reference deployment for combined qualification.

Contract version 1 covers allocation, inspection, start, stop, deletion and connection handling. An allocation is tied to its exact owner, backing resource identities and revision. A missing known resource is stale. An unknown write requires observing the original allocation before any retry. Stop requires proof that the exact writer terminated, and deletion retains the original data volume. The connection signal covers the lifetime of HTTP streams and WebSockets, so revocation closes established traffic. The `namespace`, `sandbox` and `data` fields preserve the existing binding format.

## Identity and storage

An OIDC `(issuer, subject)` maps to `(tenantId, principalId)`. The platform keeps one environment binding per owner, including its allocation key and Sandbox/PVC UIDs. Namespace names and labels do not grant user access.

One user PVC stores workspace, HOME and DSH_HOME. Platform state, OIDC secrets and Kubernetes credentials stay in the platform namespace. Workload service accounts have no cluster token. The fixed network policy admits platform traffic and excludes cluster/private/metadata destinations from public egress.

Normal Pod recreation changes the Pod UID and retains the Sandbox/PVC identity. Runtime checks the current Pod and endpoints at connection time. Authorization revocation cancels existing HTTP/WebSocket connections. The [runtime repository](https://github.com/GuoMonth/dsh-isolated-runtime) links its contract for states, mutations and error handling.

## Sources and validation

- [DSH target](../../scripts/dsh-target.ts): the only DSH npm version and source commit.
- Helm chart [Chart.yaml](../../charts/dsh-platform/Chart.yaml): `version` is the chart revision. `appVersion` is that DSH pin, not the platform npm version.
- [Connector provenance](../../vendor/environment-connector.json): source commit and tarball integrity.
- [Installation asset sources](../../charts/dsh-platform/files/sources.json): controller, runtime RBAC and the copied DSH pin.
- [Release validation](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.11.0-rc.1/validation.md): actual images, two-user/model/tool checks and limits.

[Product principles](../../CONSTITUTION.md) set the shared boundaries. [Operations](operations.md) explains user-visible data and lifecycle behavior.
