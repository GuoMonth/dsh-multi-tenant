# dsh-multi-tenant

Multi-tenant SaaS extension for DeepSeek Harness (DSH): tenant identity,
session ownership, authorization boundaries, tenant-aware MCP, and audit.

A pnpm monorepo of [Cordis](https://github.com/cordiverse/cordis) plugins for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> **Status: early development / architecture bootstrap.** The core is a
> fail-closed ownership + authorization contract; the web integration is still
> an active seam spike. See each package's README for its own status.

## Packages

| Package | Role |
| --- | --- |
| [`dsh-multi-tenant`](./packages/multi-tenant) | Core: `ctx.multiTenant` + `ctx.tenantSessionStore`, claim-once ownership, fail-closed authorization. |
| [`dsh-multi-tenant-web`](./packages/multi-tenant-web) | Web integration: principal binding, unary RPC guard, mux/host filtering, `/api/respond` ownership. (early spike) |

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Root scripts delegate to every workspace package via `pnpm -r`.

## License

MIT
