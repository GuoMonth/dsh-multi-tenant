[简体中文](./README.zh-CN.md) | English

# Docs

Navigation hub for `dsh-multi-tenant` documentation.

## Guides

- [README](../README.md) — project overview
- [CONTRIBUTING](../CONTRIBUTING.md) — development policy
- [ROADMAP](../ROADMAP.md) — current release/ecosystem direction

## Decision records (ADR)

- [Session genesis ownership](./adr/session-genesis.md) — Agent `setup` admission point
- [Web enforcement](./adr/web-enforcement.md) — H3 principal-scope ecosystem seam

## Specs & analysis

- [Architecture](./specs/architecture.md) — capability/layer ownership
- [Session genesis map](./specs/session-genesis-map.md) — `prepare → setup → enter → announce`
- [Admission composition](./specs/admission-composition.md) — plugin admission composition
- [Web seam map](./specs/web-seam-map.md) — authorization surfaces

## Reference

- [Compatibility & versioning](./reference/compatibility.md) — Node / Cordis / DSH ranges + pinning
- [Kernel prerelease contract](./reference/release.md) — current artifact, proof, OIDC publication, and boundaries

## Releases

- [`v0.1.0-rc.1`](./releases/v0.1.0-rc.1.md) — first public kernel prerelease
- [`v0.1.0-rc.2`](./releases/v0.1.0-rc.2.md) — API subtraction / OIDC-only convergence candidate
