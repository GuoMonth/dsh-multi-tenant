# 0.11.0-rc.1

[简体中文](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/release-notes.md)

Released **2026-10-27** to npm `latest` and `next`, and as the GitHub latest release. Paired runtime: **0.5.0-rc.1**; DSH: **0.2.1-rc.3**.

- Kubernetes environments with one persistent PVC per user, on DSH 0.2.1-rc.3.
- DSH 0.2.1 native authenticated-browser settings persistence; the runtime no longer patches the settings client.
- OIDC membership, native HTTP/WebSocket access, explicit stop/start and revocation.
- Fresh Linux/amd64 installations, one node/platform replica and trusted members.
- Validation covers installation, two-user access, native transport, retention and revocation; real model/tool use is not covered in this candidate.
- No compatibility guarantee: pin the exact platform, runtime, DSH and artifact identities you deploy.

Start with [installation](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/installation.md). Exact artifacts and tested scope: [Release](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.11.0-rc.1) · [Validation](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.11.0-rc.1/validation.md). Earlier versions remain in [Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases).
