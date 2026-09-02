[简体中文](./CONTRIBUTING.zh-CN.md) | English

# Contributing

This project has one position: a DSH multi-tenant plugin. Optimize changes for current correctness, executable evidence, and a small live tree; there is no compatibility obligation to superseded prerelease designs.

The authority path is:

```text
host authentication
  -> server-minted PrincipalContext
  -> Principal-scoped Agent directory
  -> capability/isolation leases
  -> DSH Agent + Agent-scoped MCP
  -> controlled withAgent() runtime
```

Use native Cordis services and DSH Agent/MCP lifecycle. Do not add a second DI/lifecycle system or a general framework until repeated integrations demonstrate a concrete need.

For properties the plugin cannot guarantee alone, add a narrow host protocol and state the boundary. Current examples are `PrincipalProvider`, `SecretProvider`, `TenantAgentRepository`, and `RuntimePartitionProvider`.

Before merging a material change:

- keep every Agent lookup scoped by Agent, Tenant, and Principal;
- fail closed before DSH work when authority, capability, or required isolation is missing;
- add executable lifecycle/concurrency/failure evidence;
- keep Node 22.19 and Node 24 green;
- exercise the packed artifact for public-surface changes;
- update the compact bilingual usage/security documentation;
- remove superseded code and temporary investigation artifacts.

Run `pnpm release:check`. The command does not publish. `packages/multi-tenant/package.json` is the release identity source of truth.
