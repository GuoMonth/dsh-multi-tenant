# Product principles

[简体中文](CONSTITUTION.zh-CN.md)

These principles apply to dsh-multi-tenant and dsh-isolated-runtime.

- Provide trusted organization members with persistent AI work environments using native DSH. Kubernetes is the execution backend; upstream Agent Sandbox core manages Pods and Services.
- The platform owns identity, authorization and environment bindings. Runtime owns exact resource identity and lifecycle. DSH owns conversations, models, tools and application protocols.
- Each owner has at most one environment and one data PVC. Platform secrets and control state stay outside user environments.
- Verify owner and resource UIDs before access or mutation. An unknown stop cannot authorize another writer; a missing volume cannot be replaced as recovery.
- Normal stop/start and Pod recreation retain data. Logout, revocation and default deletion retain user volumes. Backup, supported upgrades, HA and cross-node recovery require separate work.
- Alpha may change interfaces and configuration without migration support. Release and deployment use immutable source and artifact identities. Check the actual combination before claiming support.

See [architecture](docs/en/architecture.md) and the linked runtime contract for technical details.
