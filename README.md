[简体中文](./README.zh-CN.md) | English

# dsh-multi-tenant

Make DeepSeek Harness (DSH) a real **Multi-Tenant Runtime** and provide a composable **SaaS Framework Core** without replacing Cordis/DSH lifecycle semantics.

> Release candidate: **`dsh-multi-tenant@0.3.0-rc.1`**. M5 is complete; this line is release convergence only.
>
> Pinned DSH baseline: `0.1.1-rc.2` at `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`; CI never follows floating `latest`/`master`.
>
> npm publication is performed only from `main` after the full release proof; registry state is verified rather than hard-coded here.

## Product path

```text
Product / Transport authentication
        ↓ already trusted subject
Product Ingress
        ↓ TenantPrincipal
RuntimeComposition                 exact whole-plan attestation
        ↓
canonical Tenant                   Tenant MCP config
        ↓
canonical Principal                Principal Credentials
        ↓
one-shot create/resume Operation   authorization + immutable snapshot
        ↓
Principal-owned DSH Agent          long-lived
        ↓ setup before publication
official @deepseek-ai/dsh-mcp-client
        ↓
native Agent-scoped MCP Tools
```

The boundaries remain explicit:

- product authentication stays outside Core;
- Product Ingress resolves trusted identity;
- RuntimeComposition prevents Plan mixing;
- Tenant/Principal own typed Runtime capabilities through Cordis;
- Operation owns one semantic create/resume decision, not the Agent lifetime;
- the live Agent is Principal-owned and is drained by Principal teardown;
- MCP transport/protocol is delegated to the official DSH MCP client;
- strong hostile-code isolation remains a process/container/Pod concern.

## M4 foundation

M4 established:

- exact `CompositionPlan <-> RuntimeComposition` binding/attestation;
- trusted Product Ingress -> canonical Principal;
- `PrincipalCredentials` as a replaceable Principal-scoped low-level capability.

`PrincipalCredentials` is useful for the current v0.3 path but is not a promise that raw credentials are the final Agent-facing abstraction. See `docs/specs/m4-product-ingress-credentials.md` and the non-binding `docs/vision/authority-capabilities.md`.

## M5: real MCP Agent Integration

M5 adds:

- `tenantMcpConfig: CapabilityToken<TenantMcpConfig, 'tenant'>`;
- `defineTenantMcpConfigProvider()` for per-Tenant stdio / Streamable HTTP MCP config;
- credential bindings from Principal Credentials into MCP env/headers only during Agent setup;
- `createMcpAgentIntegration(principal)` for safe create/resume;
- deterministic physical MCP namespaces per Principal Session to coexist with the pinned official client's root-wide `serverName` reservation;
- Agent-scoped native DSH MCP Tools;
- fail-closed Session ownership on create/resume.

Product usage is intentionally short:

```ts
const plan = compileSaaSDefinition({
  capabilities: [
    { capability: tenantMcpConfig, required: true },
    { capability: principalCredentials, required: true },
  ],
  providers: [mcpProvider, credentialsProvider],
})

const app = await materializeRuntimeComposition(ctx, plan)
const ingress = createProductIngress(app, resolveTrustedSubject)
const principal = await ingress.resolve(subject)
const mcp = createMcpAgentIntegration(principal)

const handle = await mcp.create({ sessionId })
```

When `create()` resolves, official MCP startup + initial `tools/list` has completed inside DSH Agent setup, so the Agent already owns its native MCP Tools. `resume()` checks durable Session ownership before invoking DSH resume.

See `docs/specs/m5-mcp-agent-integration.md` and `packages/multi-tenant/README.md` for the complete contract/quick start.

## Release evidence

GitHub Actions proves on Node 22.19 and Node 24:

- exact pinned DSH source identity;
- Cordis lifecycle / one-shot Operation assumptions;
- real DSH Agent caller ownership;
- official MCP client root-wide namespace behavior;
- a real stdio MCP server using the MCP SDK;
- real `tools/list` through official `@deepseek-ai/dsh-mcp-client`;
- real MCP Tool execution through DSH `ToolRuntime.execute()`;
- concurrent Acme/Alice, Acme/Bob and Globex/Alice config/credential isolation;
- cross-Principal resume denial before DSH factory invocation;
- failed MCP startup with no half-published Agent and a fail-closed ownership reservation;
- Agent/Principal teardown of MCP tools/connections;
- typecheck, unit/contract tests and build;
- tarball export smoke;
- a **clean installed-artifact smoke** that installs the packed candidate beside `@deepseek-ai/dsh@0.1.1-rc.2` and triggers the packaged M5 path, including dynamic resolution of the official MCP client.

The same installed-consumer contract is reused after npm publication by `scripts/registry-smoke.mjs`.

## Release: v0.3.0-rc.1

No new architecture milestone is part of this candidate. Release convergence consists only of exact version identity, release notes, package/document alignment, permanent artifact/registry smoke and the existing full release proof.

Publication remains an explicit manual action from `main` through `.github/workflows/release.yml`. The workflow runs `pnpm release:check`, publishes via npm Trusted Publishing/OIDC, verifies the exact registry artifact and `latest`, then creates the matching Git tag and prerelease GitHub Release.

See [Direction](./ROADMAP.md) and [Release contract](./docs/reference/release.md).

## Long-term principle

```text
Core identity / lifecycle
        ↓
Authority / Credential Broker plugin
        ↓
Service Integration plugin
        ↓
Typed Client / Transport capability
        ↓
Operation
```

> **Core owns identity/lifecycle; Broker owns authority/secrets; Integration owns vendor protocol; Operation consumes typed abilities; secrets stay behind the authority boundary whenever practical.**

This is Vision, not current release scope. A public Broker contract must be earned by another real integration such as ERP.

## Public subpaths

```text
dsh-multi-tenant
dsh-multi-tenant/runtime
dsh-multi-tenant/operation
dsh-multi-tenant/composition
dsh-multi-tenant/runtime-composition
dsh-multi-tenant/ingress
dsh-multi-tenant/credentials
dsh-multi-tenant/mcp
dsh-multi-tenant/store
dsh-multi-tenant/testing
```

## Security boundary

Cordis Context is a trusted same-process composition/lifecycle boundary, not a hostile-code sandbox. M5 reduces normal-path credential exposure but does not protect against malicious code sharing the process. Strong filesystem/process/network/shell/secret isolation belongs to container/Pod/sidecar/remote authority deployment profiles.

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

## Verify

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

## License

MIT
