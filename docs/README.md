[简体中文](./README.zh-CN.md) | English

# Docs

Navigation hub for the live `dsh-multi-tenant` architecture and release contract.

## Guides

- [README](../README.md) — project overview and current Runtime Contract
- [CONTRIBUTING](../CONTRIBUTING.md) — engineering, relevance and assumption-first policy
- [ROADMAP](../ROADMAP.md) — v0.2 foundation and v0.3 SaaS Framework direction

## Current architecture

- [Architecture](./specs/architecture.md) — canonical Tenant/Principal Runtime model
- [Session / Agent publication boundary](./adr/session-genesis.md) — current DSH setup/publication decision

## v0.3 P0 specs

- [P0 foundation](./specs/v0.3-foundation.md) — scope, development sequence and promotion gates
- [SaaS composition](./specs/saas-composition.md) — `SaaSDefinition -> CompositionPlan -> Runtime Composition`
- [Principal operation lifecycle](./specs/operation-lifecycle.md) — Principal-owned one-shot work and Agent boundary
- [`v0.3-assumptions.json`](./specs/v0.3-assumptions.json) — machine-readable blocking assumptions and executable proofs

## Reference

- [Compatibility & versioning](./reference/compatibility.md) — exact DSH baseline and active CI evidence
- [Release contract](./reference/release.md) — package-version source of truth, npm latest, OIDC publication and registry proof

Historical Web/ApiProxy, admission-decorator and earlier static-investigation documents are intentionally kept in Git history rather than the live documentation tree.

## Releases

- [`v0.2.0-rc.3`](./releases/v0.2.0-rc.3.md) — published v0.2 Runtime Contract
- [`v0.2.0-rc.2`](./releases/v0.2.0-rc.2.md) — canonical Runtime Contract convergence
- [`v0.2.0-rc.1`](./releases/v0.2.0-rc.1.md) — first context-native v0.2 runtime candidate
- [`v0.1.0-rc.2`](./releases/v0.1.0-rc.2.md) — frozen kernel API convergence
- [`v0.1.0-rc.1`](./releases/v0.1.0-rc.1.md) — first public kernel prerelease
