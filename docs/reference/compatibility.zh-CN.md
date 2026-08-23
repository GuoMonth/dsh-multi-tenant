[English](./compatibility.md) | 简体中文

# Compatibility & Versioning Policy

## Runtime Baseline

- **Node：** `^22.19.0 || >=24.0.0`
- **Cordis peer：** `@deepseek-ai/cordis >=4.0.1 <5`
- **DSH：** 只使用显式 baseline，不依赖 floating version

CI 覆盖 Node `22.19.0` 与 Node `24`。

## 当前 DSH Baseline

`scripts/dsh-target.mjs` 是唯一 source of truth：

```js
DSH_TARGET = {
  repository: 'deepseek-ai/deepseek-harness',
  version: '0.1.1-rc.2',
  commit: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
}
```

未来升级由我们手动、显式推进；blocking CI 不会自动跟随 npm `latest` 或 upstream `master`。

## Evidence Model

Compatibility 从多个独立方向证明。只有**当前 live architecture**真正依赖的 evidence 全绿，baseline 才可接受；历史版本曾经依赖的 seam 不会永久占据 blocking CI。

### 精确 Upstream Source Identity

GitHub Actions checkout 精确 upstream release commit，并验证：

- checkout HEAD 等于 `DSH_TARGET.commit`；
- upstream root `package.json.version` 等于 `DSH_TARGET.version`。

### DSH Publication 与 Owner-context Behavior

`pnpm probe:dsh` 在 clean temp consumer 安装精确 published DSH package，并证明：

- **Session genesis** —— setup / publication visibility 与 rollback；
- **caller-bound Agent owner context** —— DSH Agent creation 保持 trusted Tenant / Principal caller metadata 与 capability resolution。

这只是 upstream seam evidence，不再被误当成“一次用户 Operation”的语义定义。

### Cordis Lifecycle Behavior

`pnpm probe:cordis` 证明 Runtime 依赖的外部 lifecycle assumption：

- child Fiber ownership / cleanup 跟随 parent lifetime；
- `ctx.inject()` dependency-reactive，provider 消失再恢复时 callback 可能重新执行。

第二条正是 user-visible work 必须使用 non-reactive Principal Operation，而不能直接使用 raw inject callback 的原因。

### SaaS Core Vertical Compatibility

`pnpm probe:saas-core` 使用 pinned public AgentRegistry 执行当前完整 DSH-facing 主链：

```text
Typed CompositionPlan
  -> Tenant / Principal
  -> Principal-owned one-shot Operation
  -> typed capability snapshot
  -> real DSH Agent create / resume / failure
```

Proof 覆盖多个 Tenant / Principal、caller-bound identity / capability visibility、exactly-once semantic execution、create/resume、downstream failure、quiescent cleanup。

这是当前 v0.3 Core 最重要的 integration evidence。

### Packed Artifact Behavior

`pnpm smoke` 会 build + pack npm artifact，把 tarball 安装到 clean external consumer，再执行 public Runtime / Composition / Operation contract，包括 typed capability snapshot 与 scope-local composition identity。

只测 source workspace 不足以证明 release artifact。

## Historical Evidence 不是永久 Gate

历史 Web/ApiProxy、global admission-decorator、raw reactive integration-fiber 实验继续留在 Git history，不作为 live blocking compatibility suite。

未来如果架构真的重新依赖某个 seam，应从届时的 current requirement 重新建立 focused proof，而不是默认复活旧 surface。

## 手动 Baseline Refresh

当明确升级 DSH / Cordis 时：

1. 选择显式 version；DSH 同时选择 release commit；
2. 更新 `scripts/dsh-target.mjs` 与当前 active dependency pin；
3. workspace graph 变化时从真实 registry 重新生成 `pnpm-lock.yaml`；
4. 验证精确 upstream source identity；
5. 执行 `pnpm probe:platform`，让 DSH + Cordis + SaaS Core assumption 一起验证；
6. 执行 quality / packed-consumer gate；
7. contract 失败时从工程结构 / 数据结构 / 状态模型修正，不削弱 evidence；
8. current docs 更新到新 baseline，历史 release notes 不改写。

## Compatibility Philosophy

项目处于快速 prerelease 开发期。旧 API、test harness、investigation surface 只因为“曾经正确”并不足以继续保留。

Compatibility 遵循：

- 仓库自己拥有的边界严格 enforce；
- DSH / Cordis / provider / integration 生态拥有、且 live architecture 真正依赖的 seam，才去证明或 standardize；
- 已不服务产品方向的 seam，从 live tree 删除，不维护 compatibility theater。

## CI Gates

PR 与 `main` 必须通过：

- 精确 upstream DSH source baseline verification；
- frozen-lockfile install；
- package / architecture invariant（`pnpm verify`）；
- release manifest preflight；
- TypeScript typecheck；
- unit / contract tests；
- build；
- packed external-consumer smoke；
- Node 22.19 / Node 24 上的 DSH + Cordis + SaaS Core platform probes。

## Runtime / Core Dependency Invariant

当前 publishable package 保持 runtime dependency 最小，并优先使用 Cordis / DSH native seam，而不是把 vendor implementation 塞进 Core。

Product authentication protocol、durable secret store、database、HTTP/WebSocket server、具体 vendor integration 默认都属于 Core 之外，除非未来真实 boundary 明确证明例外必要。

MCP 按 selected DSH baseline 提供的 native integration seam 组合；v0.3 不为了兼容广度建立第二套平行 MCP protocol stack。
