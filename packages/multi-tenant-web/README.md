[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant-web

Experimental DSH Web tenant-bound `ApiProxy` enforcement research.

> **Repository-only in the 0.1 kernel release.** This workspace package is
> `private: true` and is intentionally not publishable while its production
> principal-binding contract depends on a DSH request/connection-scoped transport
> seam. R3 publishes only `dsh-multi-tenant`.

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

This package does **not** block or ship with the first `dsh-multi-tenant` kernel
prerelease. The next Web deliverable is a small, generic upstream
request/connection-scope proposal. Once DSH exposes an adequate seam, this
package can add principal-bound HTTP/WS admission, streams, `respond`, and a
two-tenant E2E suite, then freeze a production public contract.

See [`ROADMAP.md`](../../ROADMAP.md) and
[`docs/adr/web-enforcement.md`](../../docs/adr/web-enforcement.md).
