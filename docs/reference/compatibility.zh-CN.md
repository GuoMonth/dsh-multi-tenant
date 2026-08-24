[English](./compatibility.md) | 简体中文

# Compatibility & Evidence

`0.3` 使用显式 platform baseline。Blocking CI 不跟 floating DSH / npm latest。

## Supported Baseline

- **Node：** `^22.19.0 || >=24.0.0`
- **Cordis：** `@deepseek-ai/cordis >=4.0.1 <5`
- **DSH：** `0.1.1-rc.2`
- **DSH release commit：** `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

`scripts/dsh-target.mjs` 是 DSH version / commit 的 source of truth。

## CI 到底证明什么

### 精确 upstream identity

CI 会 checkout 精确 DSH release commit，并在 compatibility job 前验证 source version。

### 0.3 仍然依赖的 DSH lifecycle seam

`pnpm probe:dsh` 只保留当前产品链仍然依赖的两个外部事实：

- Agent setup / publication ordering 能阻止 setup failure 暴露 half-configured Agent；
- DSH Agent creation 保持 caller-bound Principal-derived owner context。

这些 probe 继续存在，是因为 `0.3` 当前还依赖这些 upstream behavior，不是为了给旧 release line 保历史。

### Cordis lifecycle seam

`pnpm probe:cordis` 证明 parent / child Fiber teardown，以及 `ctx.inject()` 的 reactive 语义。后者正是用户 semantic work 使用 non-reactive Principal Operation 的原因。

### 真实 MCP Agent integration

`pnpm probe:mcp` 是当前最重要的 upstream vertical proof。它安装 pinned public DSH packages，并通过真实 stdio MCP server 验证：

- 官方 MCP client 的 `serverName` 行为；
- 真实 `tools/list` discovery；
- 真实 DSH `ToolRuntime.execute()` -> MCP `tools/call`；
- Agent-scoped Tool visibility；
- Tenant / Principal config 与 credential 并发隔离；
- cross-Principal resume 在 DSH Agent seam 前拒绝；
- startup-failure 与 teardown 行为。

### Installed artifact

`pnpm smoke` 会 build / pack `dsh-multi-tenant`，检查 tarball 与 export targets，然后把 packed artifact 与 `@deepseek-ai/dsh@0.1.1-rc.2` 一起安装到 clean consumer，执行当前 Product Ingress / RuntimeComposition / Credentials / MCP contract。

发布后的 registry smoke 复用同一套 installed-consumer proof 去验证 exact npm version。

## Compatibility Philosophy

项目仍处于快速 prerelease：

- 当前产品依赖的 external seam 才值得长期证明；
- 旧 milestone 名称、历史 release note、被替代的 probe 从 live tree 删除；
- 真实 integration 如果证明 contract 不够好，可以做 breaking change；
- Git history / tag 负责考古，live repository 只优化当前 correctness 与迭代速度。

## Baseline Upgrade

明确升级 DSH / Cordis 时：

1. 选择显式 version 与 DSH release commit；
2. 更新 `scripts/dsh-target.mjs` 与 active dependency pins；
3. 需要时重建 lockfile；
4. 跑 source identity、platform probes 与 installed-artifact smoke；
5. 从结构上修失败，不削弱 evidence；
6. 更新 live docs 到新 baseline。
