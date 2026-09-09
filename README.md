# dsh-multi-tenant

`dsh-multi-tenant` is a multi-tenant plugin for DeepSeek Harness. It turns an authenticated `(tenantId, principalId)` into an owned Agent resource without exposing or accepting the underlying DSH session identity.

Current source version: **`dsh-multi-tenant@0.5.0`**, pinned to DSH **`0.1.5-alpha.1`** at commit **`5dda764ed3aa172535a7967b06ff95d9cbfe536a`**. Release identity: **`v0.5.0`**, using npm's `latest` dist-tag. See [GitHub Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases) for publication status.

This version supports only DSH `0.1.5-alpha.1`. DSH remains an upstream alpha. We maintain one reviewed baseline, without a promise of compatibility with older or future Harness builds. `0.5.0` replaces the `0.4.0` DSH peer requirement; the Principal API and SQLite Agent Directory schema remain unchanged.

The plugin owns Principal-scoped Agent authorization, a durable SQLite Agent directory, capability leases, and DSH Agent/MCP lifecycle. The host owns authentication, secret storage, and any strong process/container isolation.

A newly created Agent is checkpointed through DSH before its Directory record becomes ready, including an empty session. A missing or failed durability checkpoint prevents publication and disposes the acquired Agent.

The driver now uses the real DSH registry/setup types and explicit branded identifiers. Native lifecycle verification uses V3 logs and `SessionHandle` reads with explicit flush and close, and checks writer contention and release on disposal. Historical logs are handled by DSH itself; this plugin does not maintain a log migration layer. **Rollback requires the matching pre-upgrade data as well as the old runtime.** An old runtime may read the retained old log while missing newer messages.

- [Usage and API](./packages/multi-tenant/README.md)
- [中文说明](./README.zh-CN.md)
- [Compatibility and upgrade](./docs/reference/compatibility.md)
- [Release checks](./docs/reference/release.md)
- [0.5.0 changes and refactoring decisions](./docs/releases/v0.5.0.md)

```text
authenticated request
  -> server-minted PrincipalContext
  -> opaque AgentId + Principal-scoped directory lookup
  -> capability and isolation checks
  -> DSH Agent create/resume with Agent-scoped MCP
  -> controlled withAgent() runtime view
```

The shared runtime provides logical isolation, not a hostile-code security boundary. Stock DSH `/api` remains private/administrative. The plugin does not become an authentication gateway, distributed ownership coordinator, sandbox, or process supervisor.

Lifecycle cancellation from [#50](https://github.com/GuoMonth/dsh-multi-tenant/issues/50) remains cooperative across MCP, Secret, runtime-partition, and DSH setup. Host code that ignores abort can delay shutdown. `whenIdle()` waits for Agent activity; it is not a persistence durability barrier.
