# 0.12.0-rc.1

[简体中文](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/release-notes.md)

Prepared **2026-11-04** for npm `next` and a GitHub prerelease. Paired runtime: **0.5.0-rc.2**; DSH: **0.2.1-rc.5** (`b830ec950faba0a46dda564be3e2d854afed94f1`). Published platform **0.11.0-rc.1** with runtime **0.5.0-rc.1** and DSH **0.2.1-rc.3** remains the historical release.

- Kubernetes environments with one persistent PVC per user, on DSH 0.2.1-rc.5.
- DSH 0.2.1 native authenticated-browser settings persistence; the runtime no longer patches the settings client.
- OIDC membership, native HTTP/WebSocket access, explicit stop/start and revocation.
- Fresh Linux/amd64 installations, one node/platform replica and trusted members. No in-place upgrade.
- No compatibility guarantee: pin the exact platform, runtime, DSH and artifact identities you deploy.

Start with [installation](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/installation.md). Candidate artifacts are attached at publication: [Release](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.12.0-rc.1) · [Validation](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.12.0-rc.1/validation.md). The historical release remains [0.11.0-rc.1](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.11.0-rc.1) · [Validation](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.11.0-rc.1/validation.md). Earlier versions remain in [Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases).
