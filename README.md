# dsh-multi-tenant

`dsh-multi-tenant` is a multi-tenant plugin for DeepSeek Harness. It turns an authenticated `(tenantId, principalId)` into an owned Agent resource without exposing or accepting the underlying DSH session identity.

Current release: **`dsh-multi-tenant@0.4.0`**, pinned to DSH **`0.1.2-rc.1`** at commit **`a66e4702047846cdaa10c66c9d3df3951f5ea70d`**. Its matching source tag is **`v0.4.0`**.

`0.4.0` is the first non-prerelease distribution of the clean multi-tenant plugin API and is published on npm's `latest` dist-tag. It is the reviewed, supported entry point for the documented `0.4` surface, not a `1.0`-level promise that the project will never evolve. Incompatible changes must be explicitly versioned and documented. DSH `0.1.2-rc.1` is still an upstream release candidate and remains an exact peer; a later DSH RC or stable build requires an explicit compatibility release rather than entering silently.

The plugin owns Principal-scoped Agent authorization, a durable SQLite Agent directory, capability leases, and DSH Agent/MCP lifecycle. The host still owns authentication, secret storage, and any strong process/container isolation.

The stable release carries forward the two operational contracts completed during the alpha line on top of the clean `0.4` architecture:

- abandoned SQLite `provisioning` records deterministically become terminal `failed` before the service is exposed;
- MCP, Secret, runtime-partition, and DSH setup providers receive cooperative lifecycle cancellation and are validated before use.

The DSH alpha.5-to-RC.1 upstream delta contains release metadata only: no Agent, Session, persistence, MCP, or Tools source changed. `0.4.0` nevertheless fixes every direct DSH peer/development dependency and the source-identity gate to the exact RC.1 release, then reruns the full native lifecycle and packed-consumer evidence.

It deliberately does not become a public authentication gateway, distributed ownership system, sandbox, or process supervisor. Those responsibilities stay with the host or with explicitly implemented provider protocols.

- [Usage and API](./packages/multi-tenant/README.md)
- [中文说明](./README.zh-CN.md)
- [Compatibility](./docs/reference/compatibility.md)
- [Release checks](./docs/reference/release.md)

```text
authenticated request
  -> server-minted PrincipalContext
  -> opaque AgentId + Principal-scoped directory lookup
  -> capability and isolation checks
  -> DSH Agent create/resume with Agent-scoped MCP
  -> controlled withAgent() runtime view
```

The default shared runtime provides logical isolation, not a hostile-code security boundary. Stock DSH `/api` remains private/administrative and is not a public multi-tenant ingress.

The lifecycle contract passes a service `AbortSignal` through MCP, Secret, runtime-partition, and DSH setup, as completed in [#50](https://github.com/GuoMonth/dsh-multi-tenant/issues/50). Shutdown remains cooperative: host code that ignores abort or never settles can still delay completion, and the plugin adds no forced termination or default timeout.
