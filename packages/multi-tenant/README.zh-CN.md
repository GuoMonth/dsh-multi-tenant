# dsh-multi-tenant

面向 DeepSeek Harness 的 context-native Multi-Tenant Runtime 与 v0.3 SaaS Framework Core primitives。

> npm 已发布基础：`0.2.0-rc.3`。仓库 v0.3 主线在 Runtime contract 上增加 product-facing composition binding、ingress、credentials。

## Product-facing Path

```text
trusted product subject
  -> Product Ingress
  -> RuntimeComposition
  -> canonical Tenant / Principal
  -> Principal Credentials
  -> one-shot Operation
  -> Agent Integration
  -> DSH
```

### 1. Compile 并绑定一张 Plan

```ts
const plan = compileSaaSDefinition(definition)
const app = await materializeRuntimeComposition(ctx, plan)
```

`RuntimeComposition` 拥有 exact whole-plan attestation。同 Plan join；同一 root 上 active Plan 不同抛 `RuntimeCompositionConflictError`。Canonical Tenant / Principal drift 仍使用 scope-local fingerprint。

### 2. Resolve Trusted Product Subject

```ts
const ingress = createProductIngress(app, subject => ({
  tenantId: subject.organization,
  userId: subject.account,
}))

const principal = await ingress.resolve(subject)
```

Authentication 不进入 Core。Resolver 接收的是产品已经信任的 subject。

### 3. Principal Credentials

```ts
const provider = definePrincipalCredentialsProvider({
  id: 'credentials',
  definitionKey: 'v1',
  create({ principal }) {
    return new InMemoryPrincipalCredentials({
      erpApiToken: loadTokenFor(principal),
    })
  },
})
```

`principalCredentials` 是 canonical `CapabilityToken<PrincipalCredentials, 'principal'>`，随 Principal lifecycle 隔离，可以替换 provider 而不用改 Core。`InMemoryPrincipalCredentials` 只用于 reference / test，不是 production secret store。

### 4. One-shot Work

```ts
const operation = principal.operations.start({
  requires: [principalCredentials],
  async execute({ capabilities }) {
    const credentials = capabilities.require(principalCredentials)
    return credentials.require('erpApiToken')
  },
})
```

Bound Operation 的 provider setup / isolation 来自 Plan，也不能请求 Plan 未声明的 capability。

## Low-level Runtime

v0.2 API 仍通过 `runtime` / `operation` / `composition` subpath 提供给 framework / integration code。产品层优先使用 `runtime-composition`，避免手工把 Deployment / Tenant / Principal / Operation recipe 在多张 Plan 之间混搭。

## Guarantees

- claim-once immutable Session ownership / fail-closed access；
- canonical Tenant / Principal publication / quiescent teardown；
- typed capability scope / dependency validation；
- scope-local canonical fingerprint；
- exact whole-plan RuntimeComposition attestation；
- trusted ingress -> canonical Principal；
- Principal Credentials isolation / replacement；
- one-shot Operation semantics；
- pinned real-DSH create / resume / failure evidence。

## Public Subpaths

```text
dsh-multi-tenant
dsh-multi-tenant/runtime
dsh-multi-tenant/operation
dsh-multi-tenant/composition
dsh-multi-tenant/runtime-composition
dsh-multi-tenant/ingress
dsh-multi-tenant/credentials
dsh-multi-tenant/store
dsh-multi-tenant/testing
```

## Security Boundary

Cordis Context 是 trusted same-process isolation / composition，不是 hostile-code sandbox。Filesystem / process / network / shell strong isolation 属于 container / Pod deployment architecture。

## Install

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

## Verify

```sh
pnpm release:check
```
