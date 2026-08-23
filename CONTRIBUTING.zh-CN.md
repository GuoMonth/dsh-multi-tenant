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

然后再实现最小但完整的结构。不要围绕一个弱模型不断叠加局部补丁。

## Boundary-first Decision Rule

每个 guarantee 先分类：

1. **仓库控制 -> 严格 enforce。** 我们拥有可靠 enforcement point，就让 invariant 可执行、必要时 fail closed。
2. **生态控制 -> 制定标准。** 定义或消费最小可复用的 DSH / provider seam，并给出 executable conformance contract。
3. **无法可靠 enforce -> 明确 boundary。** 不用平行 registry 或本地 fork 掩盖问题。

## Runtime Structural Rules

v0.2 Runtime 是 canonical ownership tree：

```text
Root -> Tenant -> Principal -> derived integration fibers -> DSH operations
```

所有贡献都应保持以下语义：

- Tenant / Principal 共用 canonical registry 语义；
- Principal identity 结构上嵌套在 Tenant 下；
- asynchronous creation 在 setup / commit 成功前不可发布；
- preparing creation 是可取消 lifecycle state，不只是一个 Promise；
- registry teardown 先 close admission、cancel preparing transaction，再 drain published scope；
- Principal Context 是 capability root；具体 operation 派生 fiber 并显式 inject dependency；
- DSH Agent / Preset registration scope 与 Cordis Tenant / Principal service isolation 保持分离；
- v0.1 ownership kernel 保持 shared，不被 Context metadata 替代。

如果一个新功能需要大量例外才能塞进这些规则，应该先重审 abstraction，而不是继续加例外。

## Strong Types & Semantics

优先让 TypeScript 类型 / 泛型携带语义：

- identity / state / definition 使用清晰独立类型，不用 generic dictionary；
- optional input 进入内部后 normalize 成明确数据结构；
- 尽量用 parent-child structure 编码 invariant；
- 只暴露 consumer 真正能观察的 lifecycle state；
- 上层 API 不应被迫知道底层 creation recipe；
- package version、DSH baseline 等 identity 保持唯一 source of truth。

`exactOptionalPropertyTypes` 这类 compiler failure 是设计反馈；修正数据结构，不降低 compiler strictness。

## DSH Compatibility Discipline

当前精确 baseline：

- version：`0.1.1-rc.2`
- release commit：`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

`scripts/dsh-target.mjs` 是权威 source。Baseline 只手动推进，不 floating。

一次 DSH refresh 必须：

1. 选择明确 version + release commit；
2. 所有 DSH-facing pin 一致更新；
3. 从真实 registry 重新生成 lockfile；
4. GitHub Actions 验证精确 upstream source identity；
5. 重跑精确 npm 版本的 runtime probes；
6. contract 失败时从结构上修，不削弱 evidence；
7. 当前文档更新到新 baseline，同时历史 release evidence 不改写。

参见 `docs/reference/compatibility.zh-CN.md`。

## Package Conventions

- 一个 package = 一个 independently composable / replaceable capability、integration boundary 或不可拆 security invariant；
- 优先使用 DSH / Cordis 原生 Service、Context、Fiber、scope 与 typed protocol seam；
- 早期 contract 与 default implementation 可以同 package；只有 replacement / lifecycle / versioning 价值真实出现时再拆；
- 不创建 speculative package；
- 未来 SaaS Framework 应该是由 Plugin Family 组装的 opinionated Distribution，而不是 monolithic implementation package。

## Dependency Direction

```text
Runtime/kernel primitives <- capability contracts <- providers <- SaaS distribution
```

Runtime core 不引入 transport / vendor implementation。Auth 产品、数据库、HTTP/WebSocket transport、MCP 产品集成、audit/usage implementation 与 deployment profile 都在 Runtime Contract 之上组合。

## Tests：Contract vs Conformance

- **Provider contract suite** 证明可替换 seam，例如 `TenantSessionStore`、Runtime Capability Provider Contract；
- **Conformance / invariant suite** 证明跨组件属性，例如 tenant isolation、publication ordering、lifecycle ownership；
- **Compatibility probe** 证明对精确外部 DSH version 的假设；
- **Packed / registry smoke** 证明用户真正安装到的 artifact，而不是只证明 workspace source。

## Definition of Done

- 从 architecture / data / state / type 维度完成全局审查；
- 行为决策涉及的当前 docs / ADR / spec 已同步；
- upstream / boundary ownership 明确；
- 相关精确 DSH compatibility evidence 全绿；
- `pnpm release:check` 全绿；
- transport / vendor implementation 没有泄漏进 runtime kernel；
- 不为了保留过时 prerelease abstraction 添加 compatibility shim。
