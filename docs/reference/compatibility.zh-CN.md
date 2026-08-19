[English](./compatibility.md) | 简体中文

# 兼容性与版本政策

## 运行时

- **Node** `^22.19.0 || >=24.0.0` —— 与当前 DeepSeek Harness RC7 的 engine policy 对齐。
- **Cordis** `@deepseek-ai/cordis` `>= 4.0.1 < 5`（peer）。

CI 同时覆盖最低支持的 Node 22 版本（`22.19.0`）与 Node 24。

## 当前 DSH 目标

可执行的兼容性目标统一定义在 `scripts/dsh-target.mjs`：

- **DeepSeek Harness：** `0.1.0-rc.7`
- **RC7 release commit：** `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`

所有面向 DSH 的 package pin 与 runtime probe 都必须使用这个目标。`pnpm verify`
会检查 Web proof package 的版本 pin，避免下一次 prerelease 只更新一处、却把旧 evidence 静默留下。

## RC7 evidence refresh（R1）

R1 按受影响 seam 定向复验，而不是重新设计没有变化的层。

RC6 → RC7 静态核对：

| Evidence surface | RC7 source blob | 结果 |
| --- | --- | --- |
| `RpcMethodMap`（`packages/host/apiproxy/src/api/rpc-map.ts`） | `80dede179913fc3f96bc32e71e77c75ee8460cf9` | 与 RC6 相同 |
| AgentLoop 入口（`packages/core/agent-loop/src/index.ts`） | `371154a7c9e849a444a4806268e4b2d861b8f22b` | 与 RC6 相同 |
| Session service 入口（`packages/core/session/src/index.ts`） | `2d82a88623cf8b8d381f9ba905ba2e7088cbfe12` | 与 RC6 相同 |

RC7 可执行证据：

- `scripts/session-genesis-probe.mjs` 在干净临时 consumer 中安装目标 `dsh-session`，并断言 genesis 分析依赖的 publication / rollback 行为。
- `scripts/admission-decorator-probe.mjs` 安装目标 Agent / AgentLoop / Session 包，并断言 create、fork、subagent、resume 四条路径都在 `sessions.enter` 前完成 admission。
- `dsh-multi-tenant-web` 继续通过 `Record<keyof RpcMethodMap, Category>` 对真实 `RpcMethodMap` 做编译期穷举；因此 DSH unary surface 新增或变化而没有分类时，正常 CI typecheck 会直接失败。

这些 runtime probe 现在通过 `pnpm probe:dsh` 成为正式 CI gate，而不是依赖人工 release note。

## 目标版本与历史证据

“当前 target”不意味着可以改写历史。记录 RC6 proof 的文档继续标记 RC6；R1 是在其上增加 RC7 evidence。下一次 DSH 再升级时，先识别真正变化的 seam，只重新运行受影响的 probe / conformance check，并显式更新统一 target。

版本升级是兼容性工作，不是把上游责任吸收到本仓库里的理由。如果新版本暴露了需要的 seam，就直接使用；如果 seam 属于生态但仍缺失，就定义最小、可复用的标准 / 上游提案；如果没有可靠 enforcement point，就明确边界，而不是制造脆弱的本地 fork。

## DSH prerelease pinning

**DSH prerelease 绝不依赖未限定的 `latest` tag。** 显式 pin prerelease 版本，并为 package type、runtime probe 或架构结论记录实际对应的 DSH commit SHA / release。

当 DSH 推进到新的 prerelease 时：

1. 更新 `scripts/dsh-target.mjs`；
2. 识别哪些面向 DSH 的 seam 真正变化；
3. 从显式 prerelease pin 刷新 lockfile；
4. 只重跑覆盖这些 seam 的 probe / conformance check；
5. 与此次变化无关的层保持不动。

## CI 兼容性门

Pull request 与 `main` 都运行：

- frozen-lockfile 安装；
- 架构/package 验证（`pnpm verify`），其中包含 DSH pin 漂移检查；
- typecheck、unit/contract test、build、真实 packed external-consumer smoke；
- 真实 DSH runtime proof（`pnpm probe:dsh`）；
- Node 22.19 与 Node 24 两条支持线。

packed smoke 会把生成的 kernel tarball 安装到一个干净临时 consumer，并实际调用公开 subpath，因此 CI 检查的是可发布产物，而不仅是 workspace 源码。

## 工具链

- **pnpm** `>= 11`（CI 当前使用 pnpm 11）。
- **TypeScript** `>= 6.0`（构建基线；`tsconfig.base.json`）。

## 内核不变量

内核只依赖 Cordis —— 无 transport/vendor 运行时依赖（JWT / PostgreSQL / HTTP / MCP / Redis）。由 `scripts/verify-packages.mjs`（CI 门）强制，而非靠约定。
