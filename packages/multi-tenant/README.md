# dsh-multi-tenant

Context-native multi-tenant Runtime and v0.3 SaaS Framework Core primitives for DeepSeek Harness.

> Published npm foundation: `0.2.0-rc.3`. The repository v0.3 line now converges on a usable DSH-native MCP Tools Agent path.

## Product-facing path

```text
trusted product subject
  -> Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> Tenant MCP Config + Principal Credentials
  -> one-shot create/resume Operation
  -> Principal-owned DSH Agent
  -> official DSH MCP client
  -> native Agent-scoped MCP Tools
```

### 1. Compile and bind one Plan

```ts
const plan = compileSaaSDefinition(definition)
const app = await materializeRuntimeComposition(ctx, plan)
```

`RuntimeComposition` owns exact whole-plan attestation. The same Plan joins; a different active Plan on the same root throws `RuntimeCompositionConflictError`. Canonical Tenant/Principal drift still uses scope-local fingerprints.

### 2. Resolve a trusted product subject

```ts
const ingress = createProductIngress(app, subject => ({
  tenantId: subject.organization,
  userId: subject.account,
}))

const principal = await ingress.resolve(subject)
```

Authentication is outside Core. The resolver receives a subject the product already trusts.

### 3. Principal Credentials

```ts
const credentialsProvider = definePrincipalCredentialsProvider({
  id: 'credentials',
  definitionKey: 'v1',
  create({ principal }) {
    return new InMemoryPrincipalCredentials({
      erpApiToken: loadTokenFor(principal),
    })
  },
})
```

`principalCredentials` is a canonical `CapabilityToken<PrincipalCredentials, 'principal'>`. It is isolated by Principal lifecycle and can be replaced without changing Framework Core. `InMemoryPrincipalCredentials` is reference/test infrastructure, not a production secret store.

`PrincipalCredentials` is intentionally a **low-level current primitive**, not a promise that raw tokens are the long-term recommended Agent-facing abstraction. The long-term direction is for service-specific Integration Plugins to provide typed clients/transports while authority/credential Broker plugins keep secrets behind a narrower boundary. That direction is non-binding today.

## MCP Agent integration

M5 adds a real Tenant MCP capability and a Principal-bound DSH Agent integration.

```ts
const mcpProvider = defineTenantMcpConfigProvider({
  id: 'tenant-mcp',
  definitionKey: 'v1',
  load({ tenantId }) {
    return {
      servers: [{
        transport: 'streamable-http',
        serverName: 'erp',
        url: endpointFor(tenantId),
        credentialHeaders: {
          Authorization: { credential: 'erpApiToken', prefix: 'Bearer ' },
        },
      }],
    }
  },
})

const plan = compileSaaSDefinition({
  capabilities: [
    { capability: tenantMcpConfig, required: true },
    { capability: principalCredentials, required: true },
  ],
  providers: [mcpProvider, credentialsProvider],
})

const app = await materializeRuntimeComposition(ctx, plan)
const ingress = createProductIngress(app, subject => ({
  tenantId: subject.organization,
  userId: subject.account,
}))
const principal = await ingress.resolve(subject)
const mcp = createMcpAgentIntegration(principal)

const handle = await mcp.create({ sessionId })
```

`create()` reserves Session ownership before entering DSH setup. `resume()` checks Session ownership before DSH persistence/setup. The integration mounts the compatible official `@deepseek-ai/dsh-mcp-client` during Agent setup with startup failure treated as fatal, so the returned Agent already has its initial MCP Tools.

The long-lived Agent is created through the canonical Principal Context rather than the short Operation Fiber. It therefore survives the create/resume Operation but is still structurally drained by Principal teardown.

Each configured logical server receives a deterministic runtime namespace per Principal Session. The returned handle exposes the mapping:

```ts
handle.servers
// [{ serverName: 'erp', runtimeServerName: 'erp-...', toolPrefix: 'mcp__erp-...__' }]
```

This is required by the pinned official MCP client's root-wide `serverName` reservation while preserving Agent-scoped ToolRuntime registration. It is stable across resume of the same Session.

M5 supports official MCP **Tools** only. It does not implement a parallel MCP stack and does not bridge Resources/Prompts that the pinned Harness does not consume.

### One-shot work vs live Agent lifetime

The integration internally starts one Principal-owned Operation to capture `TenantMcpConfig` + `PrincipalCredentials` and authorize create/resume exactly once. That Operation is short-lived; the resulting DSH Agent is Principal-owned and long-lived.

## Low-level Runtime

The v0.2 APIs remain available under `dsh-multi-tenant/runtime`, `operation` and `composition` for framework/integration code. Product code should prefer `runtime-composition` so Deployment/Tenant/Principal/Operation recipes cannot be accidentally mixed across Plans.

## Guarantees

- claim-once immutable Session ownership and fail-closed access;
- canonical Tenant/Principal publication and quiescent teardown;
- typed capability scope/dependency validation;
- scope-local canonical fingerprints;
- exact whole-plan RuntimeComposition attestation;
- trusted ingress -> canonical Principal;
- Principal Credentials isolation/replacement;
- Tenant MCP configuration isolation;
- cross-Principal resume denied before DSH resume;
- one-shot Operation semantics with Principal-owned long-lived Agents;
- official DSH MCP client initial discovery before Agent publication;
- Agent-scoped native MCP Tools and deterministic per-Session runtime namespaces;
- pinned real-DSH/MCP executable evidence.

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

## Runtime requirement for MCP

`dsh-multi-tenant/mcp` composes the official `@deepseek-ai/dsh-mcp-client` from the compatible DSH installation at runtime. The M5 compatibility probe installs and tests the exact pinned public package. The integration does not vendor or fork that protocol implementation.

## Security boundary

Cordis Context is trusted same-process isolation/composition, not a hostile-code sandbox. M5 reduces normal-path credential exposure by resolving bindings inside Agent setup, but malicious code sharing the process remains outside the guarantee. Strong filesystem/process/network/shell/secret isolation belongs to container/Pod/sidecar/remote deployment architecture.

Long-term authority-capability direction is documented in the repository at `docs/vision/authority-capabilities.md`; it is not part of the current npm API contract.

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

## Verify

```sh
pnpm release:check
```
