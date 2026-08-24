[简体中文](./ROADMAP.zh-CN.md) | English

# Direction

The project does not maintain a long milestone roadmap. Current contracts live in `docs/specs/*` and executable tests. This file only records the active delivery focus and the non-binding long-term direction.

## Current state

```text
v0.1  Security Kernel                         frozen
v0.2  Multi-Tenant Runtime Contract           published foundation
v0.3  SaaS Framework Core                     M5 complete; release convergence next
```

The v0.3 line now proves:

- deterministic typed Composition -> canonical Tenant/Principal Runtime;
- exact `RuntimeComposition` whole-plan binding/attestation;
- trusted Product Ingress -> canonical Principal;
- Principal-scoped replaceable Credentials;
- Principal-owned one-shot Operations;
- Tenant-scoped MCP configuration;
- Principal-bound create/resume that enforces Session ownership before DSH work;
- Principal-owned long-lived DSH Agents;
- official `@deepseek-ai/dsh-mcp-client` initial discovery before Agent publication;
- real Agent-scoped MCP Tools executed through DSH ToolRuntime;
- concurrent Acme/Alice, Acme/Bob and Globex/Alice isolation;
- create/resume/startup-failure/teardown evidence on Node 22.19 and Node 24.

## Next and only short-term target: v0.3.0-rc.1 release convergence

Do not open another architecture milestone before the first usable v0.3 prerelease.

The next PR should be small and release-focused:

```text
M5 green on main
  -> bump package to 0.3.0-rc.1
  -> finalize README / release notes
  -> upgrade registry smoke to the v0.3 product path
  -> pnpm release:check
  -> publish exact artifact
  -> verify npm latest + Git tag + GitHub Release
```

The release bar is simple: a product developer can supply trusted identity resolution, Tenant MCP configuration and Principal credentials, then create/resume a real multi-tenant DSH Agent with native MCP Tools without hand-building the DSH/MCP composition path.

## Long-term direction: Credential-as-Data -> Capability-as-Authority

`PrincipalCredentials` remains the current low-level primitive. It is useful for v0.3 and M5, but it is not a promise that raw credentials are the final Agent/application-facing abstraction.

Preferred long-term direction:

```text
Core identity / lifecycle
        ↓
Authority / Credential Broker plugin
        ↓
Service Integration plugin
        ↓
Typed Client / Transport capability
        ↓
Operation
```

This remains Vision, not release scope. The evidence sequence stays:

```text
real MCP integration (M5)       ✅
        ↓
second real integration (ERP etc.)
        ↓
compare repeated authority / refresh / injection / audit semantics
        ↓
extract only the smallest proven Broker contract
        ↓
allow deliberate prerelease breaking changes if justified
```

See [`docs/vision/authority-capabilities.md`](./docs/vision/authority-capabilities.md).

> **Core owns identity/lifecycle; Broker owns authority/secrets; Integration owns vendor protocol; Operation consumes typed abilities; secrets stay behind the authority boundary whenever practical.**
