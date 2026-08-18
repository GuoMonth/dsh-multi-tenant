[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant-web

DSH Web multi-tenant integration: principal binding, RPC/mux/WS authorization.

> **Early spike.** No production surface yet. The web-enforcement investigation
> lives in [`docs/`](../../docs) — see
> [`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md).

## Status

M4 is in progress. The admission decorator (②-A) and the real `ApiProxy` facade
with exhaustive unary classification (②-B) are done. `CLASSIFICATION` covers
all 52 current unary RPC methods and a new DSH method fails `tsc` until it is
classified.

The v0 policy is deliberately fail-closed: session-keyed point methods are
`guard`, only `session.list` is currently safe to `filter`, `session.create` is
`admit` (denied until the transport installs the pre-publication admission
bridge), and unmodelled host/deployment management plus `session.search` are
`deny`. Streams (`events`), `respond`, and `downloads` remain denied until ②-C
proves their real transport authorization path. H3 remains the principal-
binding hypothesis to validate, not a filed upstream conclusion yet.
