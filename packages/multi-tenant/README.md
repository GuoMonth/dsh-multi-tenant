# dsh-multi-tenant

**Run DeepSeek Harness safely behind a multi-tenant SaaS product.**

Use this package when one DSH runtime must serve many organizations and users without mixing Tenant configuration, Principal credentials, Session ownership or Agent-scoped MCP Tools.

> **`dsh-multi-tenant@0.3.0-rc.1`** · compatible DSH baseline: `0.1.1-rc.2`

## The problem

A single-user Agent looks like this:

```text
request -> Agent -> MCP -> backend
```

A SaaS Agent runtime has to keep this safe instead:

```text
Acme / Alice   -> Acme MCP + Alice credential + Alice Sessions
Acme / Bob     -> Acme MCP + Bob credential   + Bob Sessions
Globex / Alice -> Globex MCP + Globex/Alice credential + Globex Sessions
```

Without a reusable runtime boundary, every product ends up hand-building Tenant lookup, credential plumbing, MCP setup, Session authorization and Agent lifecycle rules.

`dsh-multi-tenant` turns that into one product flow:

```text
trusted subject
  -> Tenant / Principal
  -> Tenant MCP config
  -> Principal credentials
  -> fail-closed Session ownership
  -> Principal-bound Agent create/resume
  -> native DSH MCP Tools
```

## Install

Inside a compatible DSH profile:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

Or from framework code that already owns the compatible DSH installation:

```sh
pnpm add dsh-multi-tenant
```

The MCP path reuses the official `@deepseek-ai/dsh-mcp-client` supplied by that DSH installation. This package does not vendor or fork MCP.

## Quick start

Your product owns authentication. After a request is trusted, resolve it to a Tenant/Principal and let the runtime compose the rest.

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

const agents = createMcpAgentIntegration(principal)
const handle = await agents.create({ sessionId })
```

When `create()` resolves, the official DSH MCP client has completed initial discovery and the Agent already owns its native Agent-scoped MCP Tools. `resume()` checks Session ownership before DSH persistence/setup runs.

## What 0.3 provides

- canonical Tenant / Principal resolution from trusted product identity;
- exact `CompositionPlan -> RuntimeComposition` binding;
- Principal-scoped replaceable credentials;
- Tenant-scoped MCP configuration;
- Principal-bound Agent `create()` / `resume()`;
- immutable, fail-closed Session ownership;
- deterministic per-Session MCP namespaces;
- Principal-owned long-lived Agents;
- official DSH MCP Tools integration;
- clean installed-artifact and post-publication registry verification.

## Architecture

```text
Product authentication
  -> Product Ingress
  -> RuntimeComposition
  -> Tenant / Principal
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native Agent-scoped MCP Tools
```

The important boundaries are simple:

- Product owns authentication.
- Core owns identity, composition and lifecycle.
- Operation owns one short semantic decision, not the Agent lifetime.
- Principal owns long-lived Agents.
- DSH owns MCP wire behavior.

## Security boundary

Cordis Context provides trusted same-process identity/lifecycle separation, not hostile-code isolation. Strong secret/process/filesystem/network isolation belongs to process/container/Pod/sidecar/remote deployment boundaries.

## Compatibility

- Node: `^22.19.0 || >=24.0.0`
- Cordis: `>=4.0.1 <5`
- DSH: `0.1.1-rc.2`

The release gate verifies the packed artifact in a clean consumer beside the pinned DSH installation, and repeats the same consumer contract against the exact npm artifact after publication.

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
