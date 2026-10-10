# DSH platform architecture

[简体中文](../zh-CN/architecture.md) · [Guides](index.md)

## Components

| Component | Owns |
| --- | --- |
| dsh-multi-tenant | OIDC, membership, authorization, persisted environment bindings, access sessions, HTTP/WebSocket admission, CLI and installation |
| [dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime) | Workload image, launcher, in-process Connector, fixed resources and lifecycle |
| Agent Sandbox core | The sole Pod/Service controller |
| DeepSeek Harness | Native UI, conversations, models, tools and application protocols |

The platform calls the bundled Connector after authorization. Runtime verifies exact resources and forwards native traffic. DSH runs in each user's Pod. Kubernetes reconciles the Sandbox; runtime has no separate service or background controller.

## Identity and storage

An OIDC `(issuer, subject)` maps to `(tenantId, principalId)`. The platform keeps one environment binding per owner, including its allocation key and Sandbox/PVC UIDs. Namespace names and labels do not grant user access.

One user PVC stores workspace, HOME and DSH_HOME. Platform state, OIDC secrets and Kubernetes credentials stay in the platform namespace. Workload service accounts have no cluster token. The fixed network policy admits platform traffic and excludes cluster/private/metadata destinations from public egress.

Normal Pod recreation changes the Pod UID and retains the Sandbox/PVC identity. Runtime checks the current Pod and endpoints at connection time. Authorization revocation cancels existing HTTP/WebSocket connections. The [runtime repository](https://github.com/GuoMonth/dsh-isolated-runtime) links its contract for states, mutations and error handling.

## Sources and validation

- [DSH target](../../scripts/dsh-target.mjs): exact npm version and source commit.
- [Connector provenance](../../vendor/environment-connector.json): source commit and tarball integrity.
- [Installation asset sources](../../charts/dsh-platform/files/sources.json): controller and runtime RBAC pins.
- [Release validation](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.10.0-rc.1/validation.md): actual images, two-user/model/tool checks and limits.

[Product principles](../../CONSTITUTION.md) set the shared boundaries. [Operations](operations.md) explains user-visible data and lifecycle behavior.
