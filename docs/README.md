[简体中文](./README.zh-CN.md) | English

# Docs

Navigation hub for `dsh-multi-tenant` documentation.

## Guides

- [README](../README.md) — project overview
- [CONTRIBUTING](../CONTRIBUTING.md) — how development is done (spec-driven + test-driven)
- [ROADMAP](../ROADMAP.md) — milestones and status

## Decision records (ADR)

- [Session genesis ownership](./adr/session-genesis.md) — the Agent `setup` hook is the admission point (M2)
- [Web enforcement](./adr/web-enforcement.md) — converged: H3-only upstream seam (M3)

## Specs & analysis

- [Architecture — six layers](./specs/architecture.md) — the global six-layer map
- [Session genesis map](./specs/session-genesis-map.md) — the `prepare → setup → enter → announce` lifecycle
- [Admission composition](./specs/admission-composition.md) — how a plugin joins every Agent `setup` (M3.0)
- [Web seam map](./specs/web-seam-map.md) — the five authorization surfaces

## Reference

- [Compatibility & versioning](./reference/compatibility.md) — Node / Cordis / DSH ranges + pinning
- [Kernel prerelease contract](./reference/release.md) — `0.1.0-rc.1` artifact, release gates, boundaries, and R3 checklist
