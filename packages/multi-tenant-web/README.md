[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant-web

DSH Web multi-tenant integration: principal binding, RPC/mux/WS authorization.

> **Early spike.** No production surface yet. The web-enforcement investigation
> lives in [`docs/`](../../docs) — see
> [`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md).

## Status

M4 in progress: the admission decorator (②-A) and the real `ApiProxy` facade
with exhaustive classification (②-B) are done. `bindTenant` wraps the real
`@deepseek-ai/dsh-host-apiproxy` `ApiProxy`; `CLASSIFICATION` assigns every one
of the 52 unary RPC methods an `allow` / `guard` / `filter` / `deny` verdict (a
new DSH method fails `tsc`). Streams (`events`) and `respond` are denied until
②-C / H4. The one remaining upstream gap is a request/connection-scoped
principal (H3). See [`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md).
