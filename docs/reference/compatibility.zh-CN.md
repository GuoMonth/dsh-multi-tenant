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

Compatibility 从两个独立方向证明。

### 精确 Upstream Source Identity

GitHub Actions checkout 精确 upstream release commit，并验证：

- checkout HEAD 等于 `DSH_TARGET.commit`；
- upstream root `package.json.version` 等于 `DSH_TARGET.version`。

### 精确 Published-Package Behavior

`pnpm probe:dsh` 在干净的临时 consumer 中只验证当前架构真正依赖的 seam：

- **session genesis proof** —— publication visibility 与 rollback 语义；
- **Agent owner/composition proof** —— Principal-derived integration fiber 通过 caller-bound `ownerCtx` 进入真实 DSH Agent creation，同时保持 tenant/principal identity 与 capability resolution。

历史 Web/ApiProxy 与全局 admission-decorator 实验不再作为 blocking compatibility evidence。它们保留在 Git history；只有未来 v0.3 的真实设计重新依赖这些 seam 时，才重新研究并建立新的 contract/probe。

## 手动 Baseline Refresh

当我们明确决定升级 DSH 时：

1. 选择明确的 DSH version 与 release commit；
2. 更新 `scripts/dsh-target.mjs`；
3. 更新届时真正存在的 DSH-facing pin；
4. workspace dependency graph 变化时，从真实 npm registry 重新生成 `pnpm-lock.yaml`；
5. 重跑 source identity verification 与当前 executable probes；
6. contract 失败时从工程结构 / 数据结构 / 状态流转上修正，不削弱 evidence；
7. 当前文档统一更新到新 baseline。

历史 release note 保留当时真正验证过的版本。

## Compatibility Philosophy

项目处于快速 prerelease 开发期。我们不因为某个旧 API 或旧调查 surface 技术上“正确”，就继续维护它。

Compatibility 工作遵循三条原则：

- 仓库自己拥有的边界，严格 enforce；
- DSH / provider 生态拥有、且当前架构真正依赖的 seam，才去证明或标准化；
- 已经不服务于产品方向的旧 seam，从 live tree 删除，而不是维持 compatibility theater。

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

## Runtime Invariant

公开 runtime package 的运行时依赖只允许 Cordis。JWT、数据库、HTTP、MCP、Redis 等 vendor / transport implementation 不进入 core Runtime Contract；只有 capability/provider/distribution 边界真正出现时，才在其上层创建对应 package。
