[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant-web

DSH Web multi-tenant integration: principal binding, RPC/mux/WS authorization.

> **Early spike.** No production surface yet. The web-enforcement investigation
> lives in [`docs/`](../../docs) — see
> [`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md).

## Status

M3 concluded: the enforcement surfaces are solvable via an `ApiProxy` facade +
a `ctx.agents` decorator; the one remaining upstream gap is a
request/connection-scoped principal (H3). See the docs for the full analysis.
