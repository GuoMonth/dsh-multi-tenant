# dsh-multi-tenant

`dsh-multi-tenant` is a multi-tenant plugin for DeepSeek Harness. It turns an authenticated `(tenantId, principalId)` into an owned Agent resource without exposing or accepting the underlying DSH session identity.

Current line: **`dsh-multi-tenant@0.4.0-alpha.1`**, pinned to DSH **`0.1.2-alpha.5`**.

Status: **release-ready source, intentionally unpublished**. The `0.4.0-alpha.1` implementation and retrospective gates are complete; publication remains a separate explicit action. No `0.4` package, tag, or GitHub Release exists.

The plugin owns Principal-scoped Agent authorization, a durable SQLite Agent directory, capability leases, and DSH Agent/MCP lifecycle. The host still owns authentication, secret storage, and any strong process/container isolation.

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
