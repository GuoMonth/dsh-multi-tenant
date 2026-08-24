[English](./architecture.md) | 简体中文

# Architecture

> 当前 `0.3` Runtime / SaaS Agent foundation 的 live authority。

## Topology

```text
Product / Transport authentication
        ↓ trusted subject
Product Ingress Boundary
        ↓ TenantPrincipal
RuntimeComposition
        │ exact plan attestation
        ▼
TenantRuntimeService
  └─ canonical Tenant
       └─ canonical Principal
            ├─ typed Runtime capabilities
            ├─ one-shot Operation
            └─ Principal-owned DSH Agent
                 └─ native DSH integrations / MCP Tools
```

当前架构拆开五类 concern：

1. **Persistent authorization** —— `TenantSessionStore` + `MultiTenantService` 拥有 immutable Session ownership；
2. **Product Ingress** —— 把已经可信的 product subject 映射成 `TenantPrincipal`；authentication protocol 留在 Core 外；
3. **Runtime composition** —— `RuntimeComposition` 把一张精确 `CompositionPlan` 绑定成一个 active materialized product Runtime；
4. **Runtime capability / Operation** —— Cordis Context / Fiber 拥有 Deployment / Tenant / Principal / Operation capability lifecycle；
5. **Agent Integration** —— 把可信 Runtime state 组合成 DSH-native Agent / plugin。

Hostile-code strong isolation 属于 deployment boundary。

## Canonical Runtime Ownership

当前结构 invariant：

```text
Root -> Tenant -> Principal
                   ├-> Operation
                   └-> DSH Agent
```

Tenant / Principal 是 canonical node。Canonical creation 是 transaction：

```text
reserve
  -> unpublished Cordis subtree
  -> setup
  -> optional synchronous commit
  -> publish
```

Preparing creation 可取消。Teardown 先 close admission、取消 preparing work、drain published descendant，最后 dispose owner Fiber。

Durable Session ownership 是 shared authorization state；Context identity 只是 composition metadata，不是 authorization record 本身。

## Typed Capability Authority

Runtime capability 使用 `CapabilityToken<T, Scope>`：

```text
stable Cordis service key
+ semantic TypeScript value type
+ lifecycle / authority scope
```

Scope：

```text
deployment -> tenant -> principal -> operation
```

Scope 是真实 ownership，不是 label。非 deployment provider 在声明的 Cordis scope materialize，parent-scoped provider 不能依赖 descendant authority。

Cordis 仍然是唯一 service resolver / registry。`CapabilityToken`、`provideCapability()`、`getCapability()` 只增加 typed semantics，不建立第二套 DI。

## Composition Identity

`CompositionPlan` 有两级 identity：

```text
plan.fingerprint
  exact whole-plan product identity

scopeFingerprints[scope]
  某 authority scope 的 selected provider dependency closure
```

Scope-local fingerprint 防止无关 descendant evolution 错误 invalid canonical parent。Whole-plan attestation 解决另一件事：一个 active product Runtime 不能静默混用不同 Plan。

- scope-local fingerprint = canonical creation drift；
- whole-plan attestation = product Runtime composition integrity。

## One-shot Operation

Cordis `ctx.inject()` 是 dependency-reactive，dependency 消失 / 恢复时 callback 可能重跑。这适合 plugin lifecycle，不适合一次 user transaction。

Principal-owned Operation：

1. 创建 ephemeral child Fiber；
2. 从 bound Plan materialize Operation-scoped provider；
3. required typed capability 只 capture 一次；
4. semantic `execute()` 只调用一次；
5. deterministic drain。

Bound Operation 只能请求其 `RuntimeComposition` Plan 已声明的 capability。

Snapshot 固定 capability selection，不承诺任意 mutable object internals 的 deep immutability；provider-owned client / resource 仍拥有自己的 lifetime contract。

## Product Ingress / Credentials

`createProductIngress()` 从 authentication 之后开始：

```text
trusted subject -> resolver -> TenantPrincipal -> RuntimeComposition.principal()
```

`principalCredentials` 是 Principal-scoped low-level capability。Production authentication 与 secret-store implementation 属于产品 / provider 层。

## MCP Agent Boundary

当前 DSH-native integration 是显式的：

```text
TenantMcpConfig + PrincipalCredentials
  -> one-shot create/resume Operation
  -> Session authorization
  -> Principal Context
  -> DSH Agent setup(agentCtx)
  -> 官方 @deepseek-ai/dsh-mcp-client
  -> Agent-scoped native MCP Tools
```

短生命周期 Operation 拥有 decision / snapshot；long-lived Agent 属于 Principal，并由 Principal teardown 回收。

不要把 Cordis private isolation map 复制进 `Agent.ctx`，也不要创建平行 Agent / MCP registry。

## Security Boundary

对 conforming trusted same-process code，当前保证：

- durable Session ownership check；
- Tenant / Principal capability separation；
- deterministic composition / publication / teardown check。

不保证：

- process-memory isolation；
- filesystem / shell / network isolation；
- hostile same-process plugin protection。

Threat model 需要更强隔离时，使用 process / container / Pod / sidecar / remote boundary。
