[简体中文](./DIRECTION.zh-CN.md) | English

# Direction

`0.3` is the current product baseline. We do not maintain a long milestone roadmap or preserve prerelease archaeology in the live tree just because it once existed.

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

The immediate goal is not another milestone. It is to release `0.3.0-rc.1`, use it in real products, and keep the tree small enough to evolve quickly from actual friction.

## Next evidence, not next milestone

The next architectural decision should come from a second real integration (for example ERP), not from another speculative roadmap.

The question worth answering is whether authority / refresh / injection / audit behavior repeats across integrations strongly enough to justify a reusable Broker / authority plugin contract.

```text
real MCP integration        ✅
        ↓
second real integration
        ↓
compare repeated semantics
        ↓
extract only proven abstractions
        ↓
make prerelease breaking changes when justified
```

## Live tree policy

- Keep current code, current contracts and current evidence.
- Delete superseded milestone names, old release notes and one-shot probes/workflows.
- Let Git history and tags preserve archaeology instead of charging the active tree for it.
- Add packages/abstractions only after real vertical slices prove independent value.

## Long-term principle

> **Core owns identity/lifecycle; Broker owns authority/secrets; Integration owns vendor protocol; Operation consumes typed abilities; secrets stay behind the authority boundary whenever practical.**

See [`docs/vision/authority-capabilities.md`](./docs/vision/authority-capabilities.md).
