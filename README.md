# dsh-multi-tenant

OIDC, membership authorization, environment sessions and native DSH access, backed by Kubernetes Cells from [dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/README.md).

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

The previously published `0.8.0` CLI starts a local Docker demo, not this Cell flow. See the [alpha startup guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.md) for source packaging, existing-cluster deployment, configuration and administrative commands.

## Ownership

| Component | Owns | Does not own |
| --- | --- | --- |
| `dsh-multi-tenant` | OIDC, trusted membership, user protocols, parent/child sessions, durable allocation intent, authorized proxy | Pod/PVC controllers or runtime image builds |
| `dsh-isolated-runtime` | Cell Operator/images, resource identity/lifecycle, restricted Connector | User login, membership or platform sessions |
| DSH | Native Web, application sessions, tools and model calls | Platform tenant authorization |

The internal contract stays backend-neutral; formal cross-backend compatibility waits for a second real need. One cluster, one platform replica and a fixed version combination; no HA or recovery-system expansion.

## Real alpha test

Captured from the 2026-09-20 OIDC → Cell → native DSH session. deepseek-flash wrote/read a file and read an uploaded attachment. This is DSH's native UI; model credentials are not supplied by this project.

![Native DSH running a real model inside a Cell](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/images/cell-native.png?raw=true)

![Native file tool calls](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/images/cell-tools.png?raw=true)

The [regression report](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/evidence/cell-regression-2026-09-20.md) distinguishes cluster, local socket and fixture evidence. The [release notes](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/releases/v0.9.0-alpha.1.md) distinguish tested source from pending public artifacts.

- [Constitution](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONSTITUTION.md) · [S0 contract](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/design/s0-runtime-architecture.zh-CN.md)
- [Alpha/release runbook](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/release.md) · [Contributing](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONTRIBUTING.md)
- [Documentation](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/README.md) · [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82)

Legacy Process/Docker SDK exports remain historical development entry points, without a backend compatibility promise; the current CLI does not use them. MIT; bundled dependencies retain their licenses in THIRD_PARTY_NOTICES.
