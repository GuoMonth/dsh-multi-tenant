[简体中文](./DIRECTION.zh-CN.md) | English

# Direction

`0.3` is the current product baseline. We do not maintain a long milestone roadmap or preserve prerelease history in the live tree just because it once existed.

## Current baseline

The project now ships one product story:

```text
trusted product subject
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> safe create/resume
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native MCP Tools
```

The immediate goal is to release and use `0.3.0-rc.1`, collect evidence from real integrations, and keep the tree small enough to change quickly.

## Next evidence, not next milestone

The next architectural decision should come from a second real integration (for example ERP), not from another speculative milestone list.

The main question is whether repeated authority/refresh/injection/audit behavior justifies promoting the current low-level credential primitive into a reusable Broker/authority plugin contract.

```text
real MCP integration        ✅
        ↓
second real integration
        ↓
compare repeated semantics
        ↓
extract only proven abstractions
        ↓
allow prerelease breaking changes when justified
```

## Long-term principle

> **Core owns identity/lifecycle; Broker owns authority/secrets; Integration owns vendor protocol; Operation consumes typed abilities; secrets stay behind the authority boundary whenever practical.**

See [`docs/vision/authority-capabilities.md`](./docs/vision/authority-capabilities.md).
