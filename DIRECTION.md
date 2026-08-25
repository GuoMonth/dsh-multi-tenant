[简体中文](./DIRECTION.zh-CN.md) | English

# Direction

`0.3` is the current product baseline. The project does not maintain a long milestone roadmap or preserve prerelease archaeology in the live tree merely because it once existed.

## Current baseline

`0.3.0-rc.1` is released and proves the Core product story:

```text
trusted product subject
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> safe create/resume
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native MCP Tools
```

The Runtime correctness problem is no longer the highest-priority gap. The next bottleneck is **Time to First Value**: can a product developer with an existing Web identity experience the multi-tenant DSH value quickly, without first becoming a framework expert?

## Next release: 0.3.0-rc.2 — First Product Experience

The next release is intentionally product-focused rather than architecture-focused.

Its P0 outcome is:

```text
existing JWT / Cookie / req.user
        ↓
TrustedSubject
        ↓
Tenant / Principal
        ↓
DSH Web + Principal-bound Agent
        ↓
real MCP Tool
        ↓
visible identity / Session isolation
```

The release scope is deliberately narrow:

1. a runnable DSH Web SaaS starter using real DSH + real MCP;
2. thin JWT and Cookie/session identity bridge examples;
3. a shorter opinionated product-facing happy path over the existing Core;
4. actionable first-use diagnostics without leaking secrets.

Success means a first-time developer can reach a real MCP Tool call in 30 minutes or less from the README/starter path, and can visibly observe allowed owner behavior plus denied cross-Principal Session access.

See [`docs/scopes/v0.3.0-rc.2.md`](./docs/scopes/v0.3.0-rc.2.md) for the frozen P0 scope and explicit non-goals.

## Not blocking rc.2

Important follow-ups remain, but they do not block First Product Experience:

- production Redis/SQL Session Store;
- universal Broker / `Capability-as-Authority` contract;
- generic OAuth/OIDC/token refresh framework;
- Permission/Policy plugin;
- full Audit/OTel product;
- second ERP/direct-business-API integration;
- hostile-code strong isolation.

These should be pulled forward only when real product usage proves they are required for the P0 experience.

## Live tree policy

- Keep current code, current contracts and current evidence.
- Delete superseded milestone names, old release notes and one-shot probes/workflows.
- Let Git history and tags preserve archaeology instead of charging the active tree for it.
- Add packages/abstractions only after real vertical slices prove independent value.
- Current release scope documents are temporary live artifacts; once shipped, history moves back to Git.

## Long-term principle

> **Core owns identity/lifecycle; Broker owns authority/secrets; Integration owns vendor protocol; Operation consumes typed abilities; secrets stay behind the authority boundary whenever practical.**

That long-term direction remains valid, but `0.3.0-rc.2` does not block on extracting the Broker abstraction.

See [`docs/vision/authority-capabilities.md`](./docs/vision/authority-capabilities.md).