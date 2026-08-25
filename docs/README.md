[简体中文](./README.zh-CN.md) | English

# Docs

This is the live documentation for the current **`0.3` product baseline**, not a historical archive.

Old prerelease notes, milestone names, completed release scopes and one-shot verification artifacts do not stay in the active tree merely because they once existed. Git history and tags preserve that archaeology when it is actually needed.

## Start here

- [Project README](../README.md) — what problem the project solves, installation, durable local ownership and the first product flow
- [Direction](../DIRECTION.md) — current direction after the Durable Local Experience release
- [CONTRIBUTING](../CONTRIBUTING.md) — engineering, evidence and live-tree policy

## Current product/runtime contracts

- [Architecture](./specs/architecture.md) — topology, ownership and security boundaries
- [Product Ingress + Credentials](./specs/product-ingress-credentials.md) — trusted identity mapping and Principal credential capability
- [MCP Agent Integration](./specs/mcp-agent-integration.md) — Tenant MCP config, Session safety and DSH-native Agent composition
- [RuntimeComposition](./specs/runtime-composition.md) — exact Plan binding/attestation and product-facing lifecycle
- [Operation lifecycle](./specs/operation-lifecycle.md) — Principal-owned one-shot semantic work
- [SaaS boundaries](./specs/saas-boundaries.md) — Product Ingress, Runtime capability and Agent Integration planes
- [SaaS composition](./specs/saas-composition.md) — compiler, scope-local identity and provider materialization

## Current product baseline

`0.3.0-rc.3 — Durable Local Experience` keeps the rc.2 real-DSH-Web product path and makes immutable Session ownership survive local process restart with a zero-external-service SQLite provider selected by the normal DSH bundle.

SQLite is intentionally the local durable / single-node adoption provider. Multi-instance PostgreSQL/other persistence, credential lifecycle, Policy/Audit and further integrations remain evidence-driven follow-ups.

The stock DSH Web request-Principal gap tracked in #41 is an acknowledged upstream boundary rather than a hidden release blocker. Production Web deployments keep DSH private behind a Product Gateway/BFF that performs authentication and protected resource authorization before forwarding.

## Evidence and release

- [`v0.3-assumptions.json`](./specs/v0.3-assumptions.json) — machine-readable external assumptions and proofs
- [Compatibility](./reference/compatibility.md) — pinned DSH/Cordis baseline and current CI evidence
- [Release contract](./reference/release.md) — npm/OIDC publication and registry verification
- [0.3.0-rc.3 release note](./releases/v0.3.0-rc.3.md) — current release candidate/product baseline

## Long-term vision

- [Authority-Oriented Capabilities](./vision/authority-capabilities.md) — non-binding evolution from raw credential access toward typed authority/client capabilities

**The live tree serves the current product. History stays in Git.**