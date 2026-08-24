[English](./README.md) | 简体中文

# dsh-multi-tenant

让 DeepSeek Harness（DSH）真正成为 **Multi-Tenant Runtime**，并在不替换 Cordis / DSH 生命周期语义的前提下提供可组合的 **SaaS Framework Core**。

> 已发布基础：`dsh-multi-tenant@0.2.0-rc.3`。
>
> 当前 v0.3 开发线：CompositionPlan 绑定/attestation、Product Ingress、Principal Credentials 已进入 Core contract。
>
> 当前 pinned DSH baseline：`0.1.1-rc.2` / `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；CI 不追 floating `latest` / `master`。

## 架构

```text
Product / Transport authentication
        ↓ 已经可信的 subject
Product Ingress Boundary
        ↓ TenantPrincipal
RuntimeComposition                 exact whole-plan attestation
        ↓
canonical Tenant                   scope-local identity
        ↓
canonical Principal                Principal Credentials
        ↓
Principal-owned Operation          one-shot typed snapshot
        ↓
Agent Integration
        ↓
DeepSeek Harness
```

关键边界保持分离：

- 产品/Transport 自己负责 authentication；
- Product Ingress 只把 trusted subject 映射成 `TenantPrincipal`；
- `RuntimeComposition` 把一张精确 `CompositionPlan` 绑定到一个 active materialized product Runtime；
- Tenant / Principal canonical identity 继续使用 scope-local dependency-closure fingerprint；
- Runtime capability 仍然是 Cordis service，不建立第二套 DI container；
- Operation 是一次 semantic work，不使用 reactive `ctx.inject()` 直接承载用户 transaction；
- Agent Integration 把可信 Runtime state 转成 DSH-native Agent / Preset / plugin composition；
- hostile-code strong isolation 属于 process / container / Pod boundary。

## Bound RuntimeComposition

v0.2 的 low-level Runtime API 仍然保留，但 SaaS 产品代码应该先 materialize 一张 Plan，再通过 bound view 使用 Runtime，而不是手工把 Plan A/B/C 的 definition 拼起来：

```ts
const plan = compileSaaSDefinition(definition)
const app = await materializeRuntimeComposition(ctx, plan)

const acme = await app.tenants.ensure('acme')
const alice = await acme.principals.ensure('alice')

const operation = alice.operations.start({
  requires: [someCapability],
  execute({ capabilities }) {
    return capabilities.require(someCapability)
  },
})
```

同一个 Plan 的 materialization 会 join / single-flight；同一个 root 上出现不同 whole-plan fingerprint 会直接抛 `RuntimeCompositionConflictError`。Composed Tenant / Principal 都携带同一份 attestation；`scopeFingerprints` 仍然只负责 canonical creation drift。

`RuntimeComposition.dispose()` 会先关闭产品侧 admission，drain 它触达过的 Tenant（因此也包括 Principal / Operation），最后释放 deployment composition。

详见 `docs/specs/runtime-composition.zh-CN.md`。

## M4：Product Ingress + Principal Credentials

Authentication protocol parsing 明确不进入 Core：

```ts
const ingress = createProductIngress(app, trustedSubject => ({
  tenantId: trustedSubject.organization,
  userId: trustedSubject.account,
}))

const principal = await ingress.resolve(trustedSubject)
```

第一个真实 product-facing Runtime capability 是 canonical Principal Credentials：

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

const definition = {
  capabilities: [{ capability: principalCredentials, required: true }],
  providers: [provider],
}
```

`principalCredentials` 是 Principal-scoped：不同 sibling / Tenant 隔离；provider 可以替换而不改 Core；消费发生在 one-shot Operation snapshot 中。In-memory 实现只用于 reference / test，不是 production secret store，并且刻意不提供枚举 secret 的 API。

详见 `docs/specs/m4-product-ingress-credentials.zh-CN.md`。

## 当前 Core Guarantees

现有 executable evidence 覆盖：

- immutable claim-once Session ownership 与 fail-closed authorization；
- canonical Tenant / Principal publication、rollback、single-flight、teardown；
- typed `CapabilityToken<T, Scope>` composition 与 fail-fast dependency validation；
- global Plan fingerprint + scope-local canonical fingerprint；
- 每个 root Context 只能有一张精确 active `RuntimeComposition`，whole-plan 混搭会失败；
- bound Operation 不能读取 Plan 之外的 capability；
- trusted subject -> canonical Tenant / Principal；
- Principal Credentials sibling / Tenant isolation、missing secret failure、provider replacement；
- Principal-owned Operation 在 provider churn 下仍只执行一次 semantic work；
- pinned DSH Agent create / resume / failure owner-context evidence；
- Node 22.19 / Node 24 与 packed external consumer。

## M5 预告

下一目标刻意保持很小：

```text
Product Ingress
  -> RuntimeComposition
  -> Tenant MCP config + Principal Credentials
  -> Operation snapshot
  -> Agent Integration
  -> DSH Agent setup
  -> @deepseek-ai/dsh-mcp-client
  -> native MCP Tools
```

不造平行 MCP protocol stack；DSH 没有稳定 native consumer seam 前不桥接 Resources / Prompts。详细 milestone Roadmap 已退休，`ROADMAP.zh-CN.md` 只保留当前状态与 M5 目标。

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

Cordis Context 是 trusted same-process composition / lifecycle boundary，不隔离 process memory、filesystem、shell、network、environment variable 或恶意同进程插件。Strong isolation 属于 process / container / Pod deployment profile。

## 安装

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

## 验证

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

## License

MIT
