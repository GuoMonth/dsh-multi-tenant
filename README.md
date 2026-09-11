# dsh-multi-tenant

A DeepSeek Harness plugin that turns host-authenticated `(tenantId, principalId)` identities into owned Agent resources.

Source version **0.6.0** targets exactly DSH **0.1.5-rc.2**, commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`. Source preparation does not publish an npm package. See [releases](https://github.com/GuoMonth/dsh-multi-tenant/releases) for published artifacts.

| Capability | Boundary |
|---|---|
| Agent CRUD and explicit Queue/Steer/Stop commands | Principal-scoped SQLite ownership; native DSH lifecycle |
| Cold history and realtime observations | Native Session cuts; safe human/assistant text; no activation or Secret acquisition |
| Native subagent catalog and continuation controls | Root-bound references, own descriptor/header verification, inherited MCP scope |
| File delivery | Own `present` facts; explicit scoped FS; current source bytes; per-request authorization |
| Optional Web example and sidebar/main slots | Authorized adapter panel; stock privileged APIs omitted |

Old API/schema/runtime compatibility is not promised. `withAgent` is removed. The shared provider offers logical isolation; the host owns authentication, Secret storage, filesystem policy and any process/container isolation. SQLite supports one active process. Teardown is cooperative, and `whenIdle()` is not a persistence barrier.

From this checkout, run `pnpm install --frozen-lockfile` and `pnpm --filter dsh-multi-tenant demo` to start the loopback example. Its printed URL offers three demonstration identities and a keyless model over real native Agent, subagent, Session and file flows. Demo cookies are not production authentication.

- [API and integration](./packages/multi-tenant/README.md)
- [中文](./README.zh-CN.md)
- [Scoped Web profile and browser verification](./packages/multi-tenant/examples/scoped-web/README.md)
- [Compatibility and boundaries](./docs/reference/compatibility.md)
- [Release process](./docs/reference/release.md)
- [0.6.0 changes](./docs/releases/v0.6.0.md)
- [#57 implementation evidence](./docs/evidence/dsh-rc2/README.md)
- [Principal-isolated native Host assessment and reproducible validation (Chinese)](./docs/evidence/native-domain-review/multiprocess/REPORT.zh-CN.md)

AgentPresets capability-scope composition and complete stock Web authority coverage remain tracked in [#68](https://github.com/GuoMonth/dsh-multi-tenant/issues/68) and [#71](https://github.com/GuoMonth/dsh-multi-tenant/issues/71). Unsupported combinations fail closed; the optional panel does not imply that the full official Web UI has been made multi-tenant.
