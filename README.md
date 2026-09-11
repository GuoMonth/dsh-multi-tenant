# dsh-multi-tenant

`dsh-multi-tenant` is a multi-tenant plugin for DeepSeek Harness. It turns an authenticated `(tenantId, principalId)` into an owned Agent resource without exposing or accepting the underlying DSH session identity.

Current source version: **`dsh-multi-tenant@0.6.0`**, pinned to DSH **`0.1.5-rc.2`** at commit **`fb2c4b9e698e30edb738bca4cf0618587db7d203`**. Release identity: **`v0.6.0`**, using npm's `latest` dist-tag. See [GitHub Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases) for publication status.

This version supports only DSH `0.1.5-rc.2`. DSH remains an upstream alpha. We maintain one reviewed baseline, without a promise of compatibility with older or future Harness builds. `0.6.0` replaces the `0.5.0` DSH peer requirement; the Principal API and SQLite Agent Directory schema remain unchanged.

The plugin owns Principal-scoped Agent authorization, a durable SQLite Agent directory, capability leases, and DSH Agent/MCP lifecycle. The host owns authentication, secret storage, and any strong process/container isolation.

A newly created Agent is checkpointed through DSH before its Directory record becomes ready, including an empty session. A missing or failed durability checkpoint prevents publication and disposes the acquired Agent.

The driver now uses the real DSH registry/setup types and explicit branded identifiers. Native lifecycle verification uses V3 logs and `SessionHandle` reads with explicit flush and close, and checks writer contention and release on disposal. Historical logs are handled by DSH itself; this plugin does not maintain a log migration layer. **Rollback requires the matching pre-upgrade data as well as the old runtime.** An old runtime may read the retained old log while missing newer messages.

- [Usage and API](./packages/multi-tenant/README.md)
- [中文说明](./README.zh-CN.md)
- [Compatibility and upgrade](./docs/reference/compatibility.md)
- [Release checks](./docs/reference/release.md)
- [0.6.0 changes and refactoring decisions](./docs/releases/v0.6.0.md)

```text
authenticated request
  -> server-minted PrincipalContext
  -> opaque AgentId + Principal-scoped directory lookup
  -> capability and isolation checks
  -> DSH Agent create/resume with Agent-scoped MCP
  -> controlled send/executeTool runtime view
```

The shared runtime provides logical isolation, not a hostile-code security boundary. Stock DSH `/api` remains private/administrative. The plugin does not become an authentication gateway, distributed ownership coordinator, sandbox, or process supervisor.

Lifecycle cancellation from [#50](https://github.com/GuoMonth/dsh-multi-tenant/issues/50) remains cooperative across MCP, Secret, runtime-partition, and DSH setup. Host code that ignores abort can delay shutdown. `whenIdle()` waits for Agent activity; it is not a persistence durability barrier.

### Scoped history and observations

With the optional exact `@deepseek-ai/dsh-session-query-sqlite@0.1.5-rc.2` service installed, `service.read(principal, id, { before, limit, signal })` returns safe text/turn history. `service.observe(principal, id, { signal })` returns a disposable async stream: `replace` baseline, cursor-based `append`, `status`, and separate per-attempt `transient` text/reset frames. HTTP exposes authenticated `GET /agents/:id/history` and `/events` (SSE) below the adapter base path. A reconnect replaces the baseline; live text received before subscribing is not replayed, and durable assistant messages replace partial text when committed.

Cold reads use native Session observations without Agent activation, MCP, or Secret acquisition. Root deletion, shutdown, request cancellation, and an optional reader-provider authorization signal close observations. Hosts must supply revocation signals for changes in login/ACL authority. Slow consumers fail and reconnect instead of losing events silently. Custom isolation providers must implement `openRead` in their own partition; the default refuses it. Raw Session events and internal paths are never product responses.

### Native subagent targets

Opt in to the exact native subagent service and in-process spawn/fork providers. `children(principal, rootId, { childRef? })` reads `subagentCatalog`; `read`, `observe`, `send` and `cancel` accept `childRef` in their options (the fourth argument for `cancel`). References are root-bound catalog positions, stable across restart, and confer no authority. Each traversal verifies the child's own descriptor and immutable header. Web paths are `/agents/:id/children` and `/agents/:id/children/:ref/{history,events,children,messages,cancel}`. Observations include safe child summaries.

One-shot children are read-only; continuable Queue/Steer use the official host delivery adapter with human provenance. Direct cold children can resume through an active root; a cold intermediate parent must become active through its own continuation before controlling deeper descendants. Remote runs without local Session facts are not Session targets. Root teardown/revocation drains native continuation descendants and owned scopes.

The shared provider supports rosterless in-process children: synchronous native publication joins the exact runtime parent's capability scope, preserving scoped MCP/Secrets and inherited tool restrictions. A child already bound to an incompatible preset scope is rejected. AgentPresets composition is tracked separately in #68; custom backends must supply their own child-control and reading capability. This is logical isolation, not an OS filesystem/container boundary.

### Authorized file deliveries

`deliveries(principal, rootId, { childRef? })` lists own native `deliverables/presented` facts. `file(principal, rootId, ref, { childRef?, signal? })` resolves a target-bound event/index reference and returns a disposable byte stream. Web exposes `GET /agents/:id/deliveries` and `GET|HEAD /agents/:id/deliveries/:ref`, also below child targets; `?download=1` forces download. Every request authenticates again. References are not bearer links and never accept a path parameter.

File access is disabled until the host implements `RuntimePartitionProvider.openFile` in the correct execution world. The optional `dsh-multi-tenant/deliveries` helper `openNativeDelivery(request, { fs, workspace, signal?, dispose })` accepts an explicitly authorized native FS and trusted Principal workspace, checks canonical containment, refuses final symlinks/directories, and reads bounded current bytes. It never treats a Session cwd as an authorization root or falls back to global host FS. Native backend containment and alias/race guarantees still apply. The default limit is 16 MiB (`maximumDeliveryBytes`, at most 256 MiB); the helper buffers at most that limit before streaming bounded chunks.

Source edits appear on the next request; removed files return 404. Responses use no-store, nosniff, safe filenames and sandbox CSP; HTML/SVG are inert text, unknown formats download. Disconnect, authority revocation, deletion and shutdown abort responses and release readers. Already sent bytes cannot be recalled. No immutable archive or desktop-open endpoint is provided.
