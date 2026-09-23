# dsh-multi-tenant

OIDC, membership authorization and native DSH access, with a Kubernetes AgentEnvironment for each user. The current tested runtime implements that workspace as a Cell from [dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/README.md).

[中文](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/README.zh-CN.md)

**Cell MVP alpha.** Two-user and real-model regression passed. `0.9.0-alpha.1` uses npm `latest`, a default installation channel, not a stability promise. Breaking changes are allowed; historical compatibility, upgrades and seamless recovery are not promised.

## Fixed release boundary

DSH is exactly **0.1.5-rc.2**, source **`fb2c4b9e698e30edb738bca4cf0618587db7d203`**. Each release locks the publicly pullable Cell and Operator images by `@sha256` digest, with matching runtime source and DSH identity in `cell-release.json` (platform) / `release.json` (runtime). Pin the deployed platform image by digest too. npm `latest` selects a package at installation; it does not authorize moving image tags or a DSH version range at runtime.

Breaking updates are allowed: publish a new explicit combination, update configuration/state expectations as needed and validate the affected flow. No compatibility shim, historical upgrade or migration promise is required. Published artifact identities stay immutable. The public runtime pair is locked to [v0.3.0-alpha.1](https://github.com/GuoMonth/dsh-isolated-runtime/releases/tag/v0.3.0-alpha.1), Linux/amd64. Exact digests are in the [release manifest](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/packages/multi-tenant/cell-release.json). Null digests block publication.


## Start

An administrator first configures Kubernetes, the platform-mode Cell Operator, OIDC, DNS/TLS, storage and permissions. The platform needs direct Kubernetes API and Cell Pod-IP connectivity; run it in the cluster. Running npx on an ordinary host does not provide cluster networking.

Runtime setup: `npx dsh-isolated-runtime@0.3.0-alpha.1 manifests` prints the pinned Operator/CRD/RBAC YAML for administrator review and deployment. Its `release` command prints the fixed Cell image and DSH version. This replaces the old standalone launcher; the runtime npm package does not run a second user-facing server.

```bash
# Node.js 24+
npx dsh-multi-tenant@latest start --config /private/config.json
```

The command runs in the foreground. SIGINT/SIGTERM stop the platform and retain Cells/data; SIGHUP reloads membership. Record the resolved exact npm version and image digests for deployment; do not resolve latest on every restart. This release does not create kind clusters.

See the [alpha startup guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.md) for existing-cluster deployment, configuration and administrative commands.

## Unpublished `cell-mvp-v1` source candidate

This branch targets `dsh-multi-tenant@0.10.0-alpha.1`; it is not published. Published `0.9.0-alpha.1` and npm `@latest` retain the calibrated-profile configuration above and do not accept the candidate schema. The Connector is bound to runtime source `ed914317e98a93752e8af4f7831c384fc1e92f13`; Cell and Operator image digests remain null because these local candidate images are not a public release. See the [candidate setup guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/cell-mvp-v1-candidate.md). DSH remains pinned to `0.1.5-rc.2`.

The local candidate passed [MVP internal acceptance on 2026-09-22](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/evidence/cell-mvp-2026-09-22.md), including native Bash subprocesses and deployment without calibration; this does not publish the candidate.

## Ownership

The current request path is Envoy TLS/routing → platform `openid-client` OIDC and admission → Node Connector → Go launcher → DSH. Envoy does not perform platform login or tenant authorization.

| Component | Owns | Does not own |
| --- | --- | --- |
| `dsh-multi-tenant` | OIDC, trusted membership, user protocols, parent/child sessions, durable allocation intent, authorized proxy | Pod/PVC controllers or runtime image builds |
| `dsh-isolated-runtime` | Current Cell Operator/images, resource identity/lifecycle, restricted Connector | User login, membership or platform sessions |
| DSH | Native Web, application sessions, tools and model calls | Platform tenant authorization |

## AgentEnvironment direction

Kubernetes is the runtime direction; Process and Docker runtime backends are not planned as supported alternatives. AgentEnvironment is the product concept. The [local integration trial](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/docs/evidence/agent-sandbox-local-2026-09-23.md) selected upstream `agent-sandbox` core: W1 will map the product directly to Sandbox, without a second CRD or controller. The existing Cell implementation and legacy provider source have not yet been removed; that cleanup is planned for W1. This design is not implemented by the current candidate. See [AgentEnvironment design](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/design/agent-environment.zh-CN.md) and [Issue #104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104).

One AgentEnvironment is the user's persistent DSH environment and is intended to contain multiple DSH conversations sharing that workspace. The currently tested Cell preserves its workspace data and native DSH state across Pod replacement. This demonstrates Cell-level persistence; it does not establish session-level isolation for home files or OAuth/CLI credentials.

The current release remains limited to one cluster, one platform replica and a fixed version combination; it does not add HA or a recovery system.

## Real alpha test

Captured from the 2026-09-20 OIDC → Cell → native DSH session. deepseek-flash wrote/read a file and read an uploaded attachment. This is DSH's native UI; model credentials are not supplied by this project.

![Native DSH running a real model inside a Cell](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/images/cell-native.png?raw=true)

![Native file tool calls](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/images/cell-tools.png?raw=true)

The [regression report](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/evidence/cell-regression-2026-09-20.md) distinguishes cluster, local socket and fixture evidence. The [release record](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/releases/v0.9.0-alpha.1.md) and [startup guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.md) describe the published package and its limits.

- [Constitution](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONSTITUTION.md) · [S0 contract](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/design/s0-runtime-architecture.zh-CN.md)
- [Alpha/release runbook](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/release.md) · [Contributing](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONTRIBUTING.md)
- [Documentation](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/README.md) · [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82)

Historical Process/Docker SDK and workbench material is outside the current Cell installation path and remains only as historical source/evidence. MIT; bundled dependencies retain their licenses in THIRD_PARTY_NOTICES.
