[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant-web

Experimental DSH Web tenant-bound `ApiProxy` enforcement research.

> **Not a production multi-user Web package yet.** The current code proves
> fail-closed unary enforcement and admission composition. Production principal
> binding depends on a DSH request/connection-scoped transport seam; this package
> does not replace the DSH Web carrier to hide that dependency.

## Status

The real `ApiProxy` facade and exhaustive unary `RpcMethodMap` classification
are implemented. The current policy is deliberately fail-closed:

- session-keyed point methods are `guard`;
- only `session.list` is currently `filter`;
- `session.create` is `admit` and remains denied until principal-scoped
  pre-publication admission can be installed;
- `session.search`, host/global management, streams, `respond`, and downloads
  remain denied until their supported tenant semantics exist.

DSH RC7's public `ConnectionRpcHandler` exposes decoded
`(endpoint, payload, signal)`, while the real HTTP/WS request stays inside the DSH
Web carrier. The official carrier also documents that it currently has no
authentication layer. The principal-scope gap is therefore treated as an
**ecosystem seam**.

## What happens next

This package does **not** block the first `dsh-multi-tenant` kernel prerelease.
The next Web deliverable is a small, generic upstream request/connection-scope
proposal. Once DSH exposes an adequate seam, this package can add principal-bound
HTTP/WS admission, streams, `respond`, and a two-tenant E2E suite, then freeze a
production public contract.

See [`ROADMAP.md`](../../ROADMAP.md) and
[`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md).
