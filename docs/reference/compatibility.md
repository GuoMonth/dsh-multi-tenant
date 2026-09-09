# Compatibility

`dsh-multi-tenant@0.5.0` targets Node `^22.19.0 || >=24.0.0` and exactly DSH `0.1.5-alpha.1`, source commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`. The release identity is `v0.5.0`, using npm's `latest` dist-tag.

Only this DSH baseline is supported by the current source. All direct DSH peer/development dependencies and resolved DSH packages are exact; older releases retain their historical support records. There is no forward-compatibility or indefinite backwards-compatibility promise. DSH is still an alpha, regardless of the plugin's version syntax.

## Upgrade from 0.4.0

`0.5.0` changes the required DSH baseline from `0.1.2-rc.1` to `0.1.5-alpha.1`. The Principal API, provider protocols, public resource identity, and SQLite `tenant_agents_v04` schema remain unchanged. The driver additionally imports the official LLM identifier constructors, so `@deepseek-ai/dsh-llm` is now an explicit exact peer.

The [upstream comparison](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.2-rc.1...dsh-v0.1.5-alpha.1) includes the SessionHandle lifecycle, V2/V3 log changes, explicit Agent API, type-only Inbox, persona prefix/suffix split, ordinary subprocess handle changes, and new Web UI. Host-provided plugins and profiles must be reviewed against those contracts; the native integration suite does not cover arbitrary host extensions.

Stop the active host before taking a consistent backup of its Agent Directory, DSH session/storage data, and configuration. Keep the exact old runtime and dependency identity with that backup. Upgrade all DSH packages together, then verify create, resume, authorization, MCP, and shutdown using the target runtime before resuming service.

DSH may migrate supported historical sessions into V3 generations while preserving old files. The plugin neither parses nor converts historical logs. Keeping the original file does not make a downgrade lossless: our RC.1 experiment resumed the old generation and did not see messages written by V3. Restore the matching pre-upgrade data and old runtime together for rollback; upgrade-time additions are outside that rollback point. Older and newer runtimes must not share a writable data directory.

## Runtime and persistence contracts

The driver uses typed `AgentRegistry.create/resume`, `AgentSetup`, and explicit Agent/tool identifiers. It does not use `ctx.agent`, construct Inbox, or call removed persistence methods. Tenant Agents are runtime roots; adding child Agents requires explicit `parentAgent`, not an ambient-context assumption.

The shared driver requires the DSH Session store and a working durability listener. It awaits `ctx.sessions.flush(agent.session)` before returning a newly created handle, so an empty session exists before the Directory becomes ready. A missing listener or failed checkpoint disposes the handle and fails publication. Custom persistent `DshRuntimeDriver.create()` implementations must establish the same ready-to-resume boundary; this is a lifecycle requirement, not a new public method.

`TenantAgentRuntime.whenIdle()` waits for Agent activity, not durable writes. Host-owned persistence inspection uses `await ctx.sessionPersistence.flush()`, `open(id, 'read')`, `read()`, and `close()` in `finally`. Live transcript access and durable-log inspection are different operations. Raw SessionHandles remain private to the trusted host/DSH lifecycle and are not added to the tenant runtime view.

DSH's writer lock protects one session's JSONL lifecycle. It does not coordinate Principal ownership, protect the SQLite directory across multiple active processes, or provide distributed fencing. The built-in repository still requires local, single-node, single-active-process deployment.

Provider lifecycle `AbortSignal` arguments remain required and cancellation remains cooperative. The plugin does not read or migrate `0.3` ownership data, retired Session claims, Operations, RuntimeComposition, or compatibility facades.

## Public surface and verification

Supported public code/API subpaths are the package root, `/mcp`, `/sqlite`, `/web`, `/testing`, and `/starter`. `./cordis.patch.yml` is exported as DSH loader configuration data. All other implementation details are private.

CI runs frozen install and the full release checks on Node 22.19 and Node 24, and checks out the exact upstream source identity. Native tests use the real AgentLoop, V3 JSONL backend and official MCP client, including restart, authorization, retained logs after delete, concurrent reader/writer behavior, and writer release on disposal. The tests do not replace the Agent factory or Session. See [release checks](./release.md) and [refactoring decisions](../releases/v0.5.0.md).
