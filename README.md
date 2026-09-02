# dsh-multi-tenant

`dsh-multi-tenant` is a multi-tenant plugin for DeepSeek Harness. It turns an authenticated `(tenantId, principalId)` into an owned Agent resource without exposing or accepting the underlying DSH session identity.

Current line: **`dsh-multi-tenant@0.4.0-alpha.1`**, pinned to DSH **`0.1.2-alpha.4`**.

Pre-publication status: the `0.4.0-alpha.1` milestone is open for a correction wave. The current blockers are [#45](https://github.com/GuoMonth/dsh-multi-tenant/issues/45), [#51](https://github.com/GuoMonth/dsh-multi-tenant/issues/51), [#52](https://github.com/GuoMonth/dsh-multi-tenant/issues/52), and [#53](https://github.com/GuoMonth/dsh-multi-tenant/issues/53), followed by the review gate [#48](https://github.com/GuoMonth/dsh-multi-tenant/issues/48). No `0.4` package has been published.

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
