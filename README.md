# dsh-multi-tenant

`dsh-multi-tenant` is a multi-tenant plugin for DeepSeek Harness. It turns an authenticated `(tenantId, principalId)` into an owned Agent resource without exposing or accepting the underlying DSH session identity.

Current line: **`dsh-multi-tenant@0.4.0-alpha.2`**, pinned to DSH **`0.1.2-alpha.5`**. The reviewed source release is identified by **`v0.4.0-alpha.2`**.

Alpha.2 is an integration release for DSH hosts, not a stable compatibility promise. It is ready for product wiring and feedback when the host already owns authentication and accepts the documented single-active-process and logical-isolation boundaries. npm distribution uses the `alpha` dist-tag and does not move `latest`; npm publication and a GitHub prerelease remain explicit distribution operations separate from the source tag.

The plugin owns Principal-scoped Agent authorization, a durable SQLite Agent directory, capability leases, and DSH Agent/MCP lifecycle. The host still owns authentication, secret storage, and any strong process/container isolation.

Alpha.2 completes two operational contracts on top of the clean `0.4` architecture:

- abandoned SQLite `provisioning` records deterministically become terminal `failed` before the service is exposed;
- MCP, Secret, runtime-partition, and DSH setup providers receive cooperative lifecycle cancellation and are validated before use.

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

Alpha.2 passes a service lifecycle `AbortSignal` through MCP, Secret, runtime-partition, and DSH setup, completing [#50](https://github.com/GuoMonth/dsh-multi-tenant/issues/50). Shutdown remains cooperative: host code that ignores abort or never settles can still delay completion, and the plugin adds no forced termination or default timeout.
