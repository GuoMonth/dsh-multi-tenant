[简体中文](./README.zh-CN.md) | English

# Docs

Live documentation for the `0.3` product baseline. Historical prerelease notes and superseded milestone/process documents belong in Git history, not in the active docs tree.

## Start here

- [Project README](../README.md) — what problem the project solves, installation and first product flow
- [Direction](../DIRECTION.md) — current product direction without a milestone roadmap
- [CONTRIBUTING](../CONTRIBUTING.md) — engineering and evidence policy

## Product/runtime contracts

- [Architecture](./specs/architecture.md) — topology, ownership and security boundaries
- [Product Ingress + Credentials](./specs/product-ingress-credentials.md) — trusted identity mapping and Principal credential capability
- [MCP Agent Integration](./specs/mcp-agent-integration.md) — Tenant MCP config, Session safety and DSH-native Agent composition
- [RuntimeComposition](./specs/runtime-composition.md) — exact Plan binding/attestation and product-facing lifecycle
- [Operation lifecycle](./specs/operation-lifecycle.md) — Principal-owned one-shot semantic work
- [SaaS boundaries](./specs/saas-boundaries.md) — Product Ingress, Runtime capability and Agent Integration planes
- [SaaS composition](./specs/saas-composition.md) — compiler, scope-local identity and provider materialization

## Evidence and release

- [`v0.3-assumptions.json`](./specs/v0.3-assumptions.json) — machine-readable external assumptions and proofs
- [Compatibility](./reference/compatibility.md) — pinned DSH/Cordis baseline and active CI evidence
- [Release contract](./reference/release.md) — npm/OIDC publication and registry verification
- [0.3.0-rc.1 release note](./releases/v0.3.0-rc.1.md) — current release candidate

## Long-term vision

- [Authority-Oriented Capabilities](./vision/authority-capabilities.md) — non-binding evolution from raw credential access toward typed authority/client capabilities

The live tree intentionally does not preserve old `0.1`/`0.2` release notes, milestone labels, or superseded investigation documents. Git history/tags preserve that archaeology when needed.
