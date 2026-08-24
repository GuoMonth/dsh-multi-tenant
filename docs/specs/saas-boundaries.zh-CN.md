[English](./saas-boundaries.md) | 简体中文

# Spec —— SaaS Framework Boundary Planes

> Status：M1–M3 Core Vertical Slice 之后的 v0.3 live architecture contract。

MR-A 已经证明，一个 SaaS 产品不能被建模成“一张扁平的、彼此同层可替换的 Provider 列表”。不同 concern 进入 Runtime 的语义边界不同；如果强行放到同一层，后续 lifecycle、protocol 与产品入口都会互相污染。

## North-star Path

```text
Product / Transport
      ↓ 由产品自己的机制完成 authentication
Trusted Subject
      ↓ 解析可信 Runtime identity
Product Ingress Boundary
      ↓
TenantPrincipal
      ↓
canonical Tenant / Principal
      ↓
Typed Runtime Capabilities
      ↓
Principal-owned one-shot Operation
      ↓ immutable capability snapshot
Agent Integration
      ↓ DSH-native Agent setup / plugin composition
DeepSeek Harness
```

这些是 **plane**，不是 package name。

## 1. Product Ingress Boundary

Authentication 发生在 Multi-Tenant Runtime 信任 identity 之前。

JWT、Cookie、OAuth/OIDC、SAML、service credential、queue metadata、可信内部调用方等都属于产品自己的认证机制。Framework Core 不负责解析或验证这些协议。

Framework 的语义边界从“认证已经成功，拿到了可信 subject”开始：

```text
trusted external subject
        ↓
identity resolution
        ↓
TenantPrincipal { tenantId, userId }
```

这个结果用来选择 canonical Tenant / Principal topology。它不是一个长期 Runtime capability，也不应该仅仅因为 authentication 是 SaaS concern，就被硬塞成 Principal Provider slot。

## 2. Typed Runtime Capability Ownership

真正存在于 Runtime topology 里的 capability 使用 `CapabilityToken<T, Scope>`。

一个 token 把三件不能独立漂移的事实绑定在一起：

```text
stable key
+ semantic value type
+ lifecycle / authority scope
```

Token 只是 Cordis service 之上的 typed semantic identity。Service resolution 与 lifecycle 仍然由 Cordis 负责；本项目不会建立第二套 registry / DI container。

Scope 保持：

```text
deployment -> tenant -> principal -> operation
```

Scope 是 authority，不是 metadata。Tenant / Principal / Operation provider 必须真的在对应 Cordis scope 内拥有并 materialize capability；外部已经挂载好的 ambient capability 只能是 deployment scope。

## 3. Composition Locality

完整 `CompositionPlan` 继续保留 global fingerprint，用于精确 whole-definition comparison 与 diagnostics；但是 canonical Runtime node 使用 **scope-local dependency-closure fingerprint**。

概念上：

```text
Operation change
  └─ 只改变 Operation slice
     └─ 不应让无关 Principal / Tenant 失效

Principal change
  └─ 改变 Principal slice
     └─ 不应让无关 Tenant 失效

Tenant provider dependency change
  └─ 因为参与 Tenant creation semantics，所以 Tenant slice 必须变化
```

一个 scope fingerprint 只包含：该 scope 自己拥有的 provider，以及这些 provider 真正依赖到的 selected ancestor provider。无关 descendant 不进入 fingerprint。

这样同时保证：

- 真实 canonical creation drift 仍然明确失败；
- 无关 lower-level 演进不会制造 false parent Runtime conflict。

## 4. One-shot Operation Boundary

Cordis plugin injection 是 reactive 的；一次用户动作不是。

因此 Principal-owned Operation：

1. 创建 ephemeral Cordis owner Fiber；
2. materialize Operation-local provider；
3. 一次性捕获 required typed capability；
4. semantic work 只执行一次；
5. deterministic teardown。

Immutable snapshot 的作用，就是从结构上阻止 dependency reactivity 演化成 transaction re-entry。

## 5. Agent Integration Boundary

Runtime capability 不会自动变成 Agent capability。

Operation 拥有可信 Runtime view；DSH 拥有 Agent/Preset/plugin composition。二者通过显式 Agent integration seam 连接：

```text
Operation snapshot
      ↓
Agent integration recipe
      ↓
ownerCtx.agents.create / resume
      ↓
DSH Agent setup(agentCtx)
      ↓
DSH-native tools / prompts / listeners / plugins
```

不要复制 Cordis 私有 isolation state 到 `Agent.ctx`；不要创建平行的 Agent tenant registry。

一个 integration 很可能同时消费多个 Runtime capability，再把它们组合成一个 DSH-native setup。因此像 MCP 这样的能力，不应该提前被建模成一个扁平的单一 Runtime Provider slot。

## MCP 对下一阶段的含义

在当前 pinned DSH baseline 中，`@deepseek-ai/dsh-mcp-client` 本身就是一个 Cordis plugin，它把 MCP **Tools** bridge 到原生 `ctx.tools`。Harness 当前还没有对 Resources / Prompts 做 bridge。

所以下一阶段应该把 MCP 当成 **Agent Integration reference path** 来验证：

```text
Tenant MCP configuration
        +
Principal credentials
        +
Operation snapshot
        ↓
DSH Agent setup
        ↓
@deepseek-ai/dsh-mcp-client
        ↓
native DSH tools
```

不要为了填满某个抽象 slot，就重新造第二套 MCP protocol stack，也不要现在为 Resources / Prompts 编写 compatibility bridge。

## 6. Strong Deployment Isolation 继续独立

Cordis Context 是可信同进程 composition / lifecycle boundary，不隔离 filesystem、process memory、shell、network、environment variable 或恶意 plugin。

Strong isolation 继续属于 process / container / Pod 等 deployment boundary。

## 对后续工作的约束

下一轮 product/capability MR 应该按照这套 topology 生长，而不是继续把 Auth、Credentials、MCP 当成同层三个 Provider：

- **Identity** 验证 Product Ingress -> `TenantPrincipal`；
- **Credentials** 验证真正的 Principal-owned typed Runtime capability；
- **MCP** 验证 Agent Integration：消费 Tenant config + Principal credential + Operation context，并使用 DSH-native seam。

这些边界未来可能自然长成独立 package，但 package 必须是已经证明的 API/lifecycle 的结果，而不是架构设计的前提。
