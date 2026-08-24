[简体中文](./README.zh-CN.md) | English

# Docs

Navigation hub for the live `dsh-multi-tenant` architecture and release contract.

## Guides

- [README](../README.md) — current product/runtime overview
- [CONTRIBUTING](../CONTRIBUTING.md) — engineering and assumption-first policy
- [Direction](../ROADMAP.md) — short current-state + M5 target preview; no detailed milestone Roadmap

## Live architecture

- [Architecture](./specs/architecture.md) — authoritative topology and security boundaries
- [SaaS boundaries](./specs/saas-boundaries.md) — Product Ingress, Runtime capability and Agent Integration planes
- [SaaS composition](./specs/saas-composition.md) — compiler, scope-local identity and provider materialization
- [RuntimeComposition](./specs/runtime-composition.md) — exact Plan binding/attestation and product-facing lifecycle
- [M4 Product Ingress + Credentials](./specs/m4-product-ingress-credentials.md) — trusted identity mapping and Principal credential contract
- [Principal operation lifecycle](./specs/operation-lifecycle.md) — Principal-owned one-shot semantic work
- [Session / Agent publication boundary](./adr/session-genesis.md) — DSH setup/publication decision

## Evidence

- [v0.3 foundation](./specs/v0.3-foundation.md) — engineering/evidence gates
- [`v0.3-assumptions.json`](./specs/v0.3-assumptions.json) — machine-readable external assumptions and proofs
- [Compatibility & versioning](./reference/compatibility.md) — exact DSH baseline and active CI evidence
- [Release contract](./reference/release.md) — npm/OIDC publication contract

Historical Web/ApiProxy and superseded investigations intentionally remain in Git history rather than the live documentation tree.
