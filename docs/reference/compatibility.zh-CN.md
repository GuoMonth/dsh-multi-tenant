[English](./compatibility.md) | 简体中文

# Compatibility & Versioning Policy

## Runtime Baseline

- **Node：** `^22.19.0 || >=24.0.0`
- **Cordis peer：** `@deepseek-ai/cordis >=4.0.1 <5`
- **DSH：** 只使用显式 baseline，不依赖 floating version

CI 同时覆盖 Node `22.19.0` 与 Node `24.x`。

## 当前 DSH Baseline

`scripts/dsh-target.mjs` 是唯一 source of truth：

```js
DSH_TARGET = {
  repository: 'deepseek-ai/deepseek-harness',
  version: '0.1.1-rc.2',
  commit: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
}
```

这是 v0.2 收口时选定的 DeepSeek Harness 当前 release。未来升级由我们手动、显式推进；blocking CI 不会自动跟随 npm `latest` 或 upstream `master`。

## Evidence Model

Compatibility 从两个独立方向证明。

### 精确 Upstream Source Identity

GitHub Actions checkout 精确 upstream release commit，并验证：

- checkout HEAD 等于 `DSH_TARGET.commit`；
- upstream root `package.json.version` 等于 `DSH_TARGET.version`。

这明确了我们的架构结论究竟对应哪一份源码。

### 精确 Published-Package Behavior

`pnpm probe:dsh` 在干净的临时 consumer 中安装精确 DSH npm 版本并执行：

- **session genesis proof** —— publication visibility 与 rollback 语义；
- **admission/publication proof** —— create/fork/subagent/resume 的 setup 必须先于 session entry；
- **Agent owner/composition proof** —— Principal-derived integration fiber 通过 caller-bound `ownerCtx` 进入真实 DSH Agent creation，同时保持 tenant/principal identity 与 capability resolution。

Web proof package 也把 `@deepseek-ai/dsh-host-apiproxy` 固定到同一个 target version，并由 `pnpm verify` 强制一致。

## 手动 Baseline Refresh

当我们明确决定升级 DSH 时：

1. 选择明确的 DSH version 与 release commit；
2. 更新 `scripts/dsh-target.mjs`；
3. 所有 DSH-facing package pin 同步到该 version；
4. 使用真实 npm registry 重新生成 `pnpm-lock.yaml`；
5. 重跑 source identity verification 与全部 executable probes；
6. 如果 contract 失败，从工程结构 / 数据结构 / 状态流转上修正，不削弱 evidence；
7. 当前文档统一更新到新 baseline。

历史 release note 保留当时真正验证过的版本。

## Compatibility Philosophy

项目处于快速 prerelease 开发期。如果早期 API 与更好的 ownership model、semantic type、lifecycle/state transition 冲突，我们不会为了兼容保留旧形态。

Compatibility 工作遵循三条原则：

- 仓库自己拥有的边界，严格 enforce；
- DSH / provider 生态拥有的 seam，定义或消费可复用 contract；
- 没有可靠 enforcement point 的地方，明确记录 boundary，不用本地 fork 或平行 registry 掩盖问题。

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
- Node 22.19 / Node 24 上的精确版本 DSH runtime probes。

## Kernel Invariant

公开 runtime package 的运行时依赖只允许 Cordis。JWT、数据库、HTTP、MCP、Redis 等 vendor / transport implementation 不进入 core Runtime Contract；Provider Family 与 SaaS composition 在其上层组合。
