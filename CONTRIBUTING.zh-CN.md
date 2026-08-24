[English](./CONTRIBUTING.md) | 简体中文

# Contributing

## 工程模型：先全局结构，再局部实现

本仓库优先长期结构正确性与快速迭代，不优先 prerelease 兼容。

改代码前先从全局建模：

1. **Ownership / Data Structure** —— canonical tree / graph 是什么？哪些非法状态应该从结构上不可表达？
2. **State Transition** —— lifecycle state、publication boundary、cancel path、teardown order 分别是什么？
3. **Semantic Types** —— identity / capability / lifecycle 的哪些语义应该由 TypeScript 类型系统表达，而不是散落成松散字段？
4. **Native Framework Structure** —— Cordis / DSH 是否已经能表达 dependency、lifecycle 或 registration plane，而不需要新 registry / facade？
5. **Executable Contract** —— 什么 test / conformance harness 能独立证明抽象，而不是只证明某个 implementation？
6. **相关性** —— 这个组件是否仍然服务于当前产品方向，还是只是一段技术上正确的历史工作？

然后再实现最小但完整的结构。不要围绕弱模型叠加局部补丁，也不要因为旧实验“技术上正确”就让它长期占据 live tree。

## Boundary-first Decision Rule

每个 guarantee 先分类：

1. **仓库控制 -> 严格 enforce。** 我们拥有可靠 enforcement point，就让 invariant 可执行、必要时 fail closed；
2. **生态控制 -> 制定标准。** 定义或消费最小可复用的 DSH / provider / integration seam，并给出 executable conformance contract；
3. **无法可靠 enforce -> 明确 boundary。** 不用平行 registry 或本地 fork 掩盖问题。

## Runtime Structural Rules

当前 v0.3 live topology：

```text
Product authentication
  -> trusted identity resolution
  -> TenantPrincipal
  -> canonical Tenant
  -> canonical Principal
  -> typed Runtime capabilities
  -> Principal-owned one-shot Operation
  -> Agent Integration
  -> native DSH Agent / Preset / plugin composition
```

除非新的 executable evidence 明确证明应当改架构，所有贡献都必须保持：

- authentication protocol handling 发生在 trusted Product Ingress boundary 之前；
- Tenant / Principal 共用 canonical registry / publication 语义；
- Principal identity 结构上嵌套在 Tenant 下；
- asynchronous canonical creation 在 setup / commit 成功前不可发布；
- preparing creation 是可取消 lifecycle state，不只是 Promise；
- registry teardown 先 close admission、cancel preparing transaction，再 drain published scope；
- capability key、value type、authority scope 由同一个 `CapabilityToken<T, Scope>` 表达；
- 声明的 scope 必须对应真实 Cordis lifecycle / authority ownership；
- canonical Tenant / Principal definition identity 使用 scope-local dependency closure，不能被无关 whole-plan descendant state 错误耦合；
- Principal 结构性拥有 ephemeral non-reactive Operation；
- 一次 Operation 只 capture 一次 required typed capability，并只执行一次 semantic work；
- Cordis reactive `ctx.inject()` 不是 user transaction primitive；
- Agent Integration 必须显式，并使用 DSH-native Agent / Preset / plugin seam；
- DSH Agent / Preset registration 与 Runtime service isolation 保持分离；
- v0.1 ownership kernel 保持 shared，不被 Context metadata 替代。

如果一个 feature 需要大量例外才能塞进这些规则，应该先重审 data model，而不是继续加例外。

## Strong Types & Semantics

优先让 TypeScript structure 携带语义：

- identity / state / definition 使用清晰独立类型，不用 generic dictionary；
- capability key + value type + scope 绑定在 `CapabilityToken`，不要各处重复 loose string；
- optional input 进入内部后 normalize 成明确 immutable data shape；
- 尽量用 parent-child structure 编码 invariant；
- 只暴露 consumer 真正能观察的 lifecycle state；
- 区分 whole-plan diagnostics identity 与 scope-local canonical creation identity；
- 上层 API 不应被迫知道底层 creation recipe；
- package version、DSH baseline 等 durable identity 保持唯一 source of truth。

`exactOptionalPropertyTypes` 这类 compiler failure 是设计反馈；修正数据结构，不降低 compiler strictness。

## DSH Compatibility Discipline

当前精确 baseline：

- version：`0.1.1-rc.2`
- release commit：`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

`scripts/dsh-target.mjs` 是权威 source。Baseline 只手动推进，不 floating。

一次 DSH refresh 必须：

1. 选择明确 version + release commit；
2. 更新届时仍然存在的 DSH-facing pin；
3. workspace graph 变化时从真实 registry 重新生成 lockfile；
4. GitHub Actions 验证精确 upstream source identity；
5. 只重跑当前 architecture 真正依赖的精确版本 Runtime / integration probe；
6. contract 失败时从结构上修，不削弱 evidence；
7. 当前 docs 更新到新 baseline，同时历史 release evidence 不改写。

参见 `docs/reference/compatibility.zh-CN.md`。

## v0.3 Assumption-first Discipline

开发同时采用 spec-driven、test-driven、assumption-first。任何由 DSH / Cordis 等外部 framework 拥有的行为，在 executable proof 前只能算 assumption。

```text
Spec -> Assumption Ledger -> executable probe / contract -> 强类型 / 状态 -> failing behavior test -> implementation
```

`docs/specs/v0.3-assumptions.json` 是 machine-readable ledger。Blocking assumption 在探索阶段可以 `open`，但必须明确阻塞哪个 public / design gate；只有对应 proof artifact + command 已存在并进入 CI 后，才能标记为 `proven`。

读 upstream source 可以解释“为什么行为大概率存在”，但不能代替 executable proof。

这条流程也是迭代式的：后续 vertical slice 如果暴露早期 abstraction 过度耦合，应直接重构 live model 与 Spec，而不是围绕已被证据推翻的结构保 prerelease compatibility。

## Package Conventions

**不要因为一个目录看起来有用就创建 package。只有独立边界真实存在时，package 才应该存在。**

一个 package 至少要拥有下面一种独立价值：

- consumer-facing contract / API；
- replaceable provider / integration capability；
- independent lifecycle / composition boundary；
- independent versioning / release boundary；
- product Distribution boundary。

Research、compatibility exploration、一次性 evidence 默认放在 test / script / docs 或 Git history，不做长期 workspace package。

通用规则：

- 一个 package = 一个 independently valuable boundary，不是一个 buzzword / capability 名称；
- 优先使用 DSH / Cordis 原生 Service、Context、Fiber、Agent/Preset scope 与 typed protocol seam；
- 早期 contract / default implementation 可以 co-locate；只有 replacement / lifecycle / versioning 价值真实出现再拆；
- 不提前 scaffold `saas`、Auth、Credentials、MCP、Transport package；
- 未来 Product Distribution 可以提供 opinionated defaults，但 Distribution concern 不能提前决定 Core topology。

## Dependency & Boundary Direction

不要把所有 SaaS concern 压成一个 Provider layer。当前 semantic direction：

```text
Product / Transport authentication
        ↓
Trusted Product Ingress
        ↓
Tenant / Principal Runtime
        ↓
Typed Runtime capabilities
        ↓
One-shot Operation
        ↓
Agent Integration
        ↓
Native DSH / Cordis
```

Credentials 是自然的 Principal-owned Runtime capability。MCP 当前更适合作为 Agent Integration proof：消费 Tenant config + Principal credentials + Operation state，再组合官方 DSH MCP Tools plugin。

不要为了让所有 product concern 看起来都像 Runtime Provider，就重造平行 protocol stack。

## Tests：Contract vs Conformance

- **Provider contract suite** —— 证明可替换 Runtime seam，例如 `TenantSessionStore` / Runtime Capability Provider Contract；
- **Ingress contract suite** —— 证明 trusted product identity 映射到正确 canonical Runtime，并且 vendor auth 不泄漏进 Core；
- **Integration contract suite** —— 证明 Runtime state 组合成 DSH-native Agent behavior，同时不发生 cross-Tenant / Principal 泄漏；
- **Conformance / invariant suite** —— 证明 isolation、publication ordering、locality、lifecycle ownership 等跨组件属性；
- **Compatibility probe** —— 证明 active architecture 对精确外部 DSH / Cordis 行为的真实依赖；
- **Packed / registry smoke** —— 证明用户真正安装到的 artifact，而不是只证明 workspace source。

## Definition of Done

- 从 architecture / data / state / type 维度完成全局审查；
- 变更与当前产品方向存在明确相关性；
- 行为决策涉及的 current docs / ADR / spec 已同步；
- blocking external assumption 已证明，或显式阻塞尚未完成的 API design；
- boundary ownership 明确：Product Ingress vs Runtime capability vs Operation vs Agent Integration；
- 相关精确 DSH / Cordis compatibility evidence 全绿；
- `pnpm release:check` 全绿；
- transport / vendor implementation 没有泄漏进 Runtime Core；
- DSH / Cordis 已有 native seam 时不引入平行 registry / protocol layer；
- 没有在真实边界出现前引入 speculative package / scaffold；
- 不为了保留过时 prerelease abstraction 添加 compatibility shim。
