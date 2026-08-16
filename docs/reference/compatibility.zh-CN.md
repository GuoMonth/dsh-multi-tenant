[English](./compatibility.md) | 简体中文

# 兼容性与版本政策

## 运行时

- **Node** `>= 22.19`（与 DeepSeek Harness engines 一致）。
- **Cordis** `@deepseek-ai/cordis` `>= 4.0.1 < 5`（peer）。

## DSH 预发布 pinning

DeepSeek Harness 子包发布了一个过期的 `latest` dist-tag（`0.0.1-rc.1`），而最新发布版本是 `0.1.0-rc.6`。**绝不要依赖 `latest`** —— pin 一个显式 prerelease 版本（例如 `…@0.1.0-rc.6`），并记录某个包的类型所针对验证的 DSH commit SHA（见 `../specs/web-seam-map.md`）。

## 工具链

- **pnpm** `>= 11`（构建脚本政策在 `pnpm-workspace.yaml` 中）。
- **TypeScript** `>= 6.0`（构建基线；`tsconfig.base.json`）。

## 内核不变量

内核只依赖 Cordis —— 无 transport/vendor 运行时依赖（JWT / PostgreSQL / HTTP / MCP / Redis）。由 `scripts/verify-packages.mjs`（CI 门）强制，而非靠约定。
