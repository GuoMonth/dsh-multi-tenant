# dsh-multi-tenant

**Multi-tenant SaaS runtime primitives for DeepSeek Harness.**

Use this package when one DSH-based product must safely serve many organizations and users without mixing Tenant configuration, Principal credentials, Session ownership or Agent-scoped MCP Tools.

> Package candidate: **`dsh-multi-tenant@0.3.0-rc.1`**
>
> Compatible DSH baseline: `0.1.1-rc.2`.

## Why you would install it

A product developer usually does not want to hand-build all of this every time:

```text
trusted user
  -> Tenant / Principal
  -> Tenant-specific MCP config
  -> Principal-specific credentials
  -> safe Session ownership
  -> DSH Agent create/resume
  -> native MCP Tools
```

This package provides the reusable Runtime/composition layer for that flow while leaving authentication, databases, secret stores and vendor business logic in your product or plugins.

## Install

Inside a compatible DSH profile:

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

Or from framework code that already owns the compatible DSH installation:

```sh
pnpm add dsh-multi-tenant
```

## Quick start

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

When `create()` resolves, the official DSH MCP client has completed initial discovery and the returned Agent owns its native Agent-scoped MCP Tools.

## Core product contracts

### Product Ingress

The framework starts after authentication. `createProductIngress()` maps an already trusted product subject into a validated canonical Tenant/Principal.

### RuntimeComposition

One exact `CompositionPlan` is bound to one active product Runtime. Different live whole-plan identities on the same root fail rather than silently mixing Deployment/Tenant/Principal/Operation recipes.

### Principal Credentials

`principalCredentials` is a replaceable Principal-scoped low-level credential capability. `InMemoryPrincipalCredentials` is reference/test infrastructure only.

### Tenant MCP + Agent integration

`tenantMcpConfig` is Tenant-scoped. `createMcpAgentIntegration(principal)` captures Tenant MCP config + Principal credentials once, checks Session ownership and creates/resumes a Principal-owned long-lived DSH Agent.

The package uses the compatible DSH installation's official `@deepseek-ai/dsh-mcp-client`; it does not vendor or fork MCP.

## Architecture

```text
trusted subject
  -> Product Ingress
  -> RuntimeComposition
  -> Tenant / Principal
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native Agent-scoped MCP Tools
```

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

Cordis Context provides trusted same-process composition/lifecycle separation, not hostile-code isolation. Strong secret/process/filesystem/network isolation belongs to process/container/Pod/sidecar/remote deployment boundaries.

## Compatibility

- Node: `^22.19.0 || >=24.0.0`
- Cordis: `>=4.0.1 <5`
- DSH baseline: `0.1.1-rc.2`

The repository release gate verifies the packed artifact in a clean consumer beside the pinned DSH installation and repeats the same contract after npm publication.
