[English](./compatibility.md) | 简体中文

# 兼容性与版本政策

## 运行时

- **Node** `>= 22.19`（与当前 DeepSeek Harness 的 engine 下限一致）。
- **Cordis** `@deepseek-ai/cordis` `>= 4.0.1 < 5`（peer）。

## 当前 DSH 目标

项目当前以 **DeepSeek Harness `0.1.0-rc.7`** 为目标基线。新的架构决策与新的兼容性工作，都针对这个基线进行评估。

“目标基线”不等于“所有历史 proof 都已经重新跑过”。证据始终保留它实际产生时的版本。例如，一个 RC6 runtime probe 在受影响 seam 为 RC7 重新验证之前，继续是 RC6 证据。只有当依赖它的受影响证据已经刷新，或者一次明确的兼容性 review 记录了上游 seam 为什么没有变化时，对应里程碑才算在当前目标版本上被证明。

这种区分让项目可以快速跟进 DSH prerelease，而不需要篡改历史，也不需要每个版本都把整个架构重新验证一遍。

## DSH prerelease pinning

**DSH prerelease 绝不依赖未限定的 `latest` tag。** 显式 pin prerelease 版本，并为任何 package type、runtime probe 或架构结论记录实际对应的 DSH commit SHA / release。

当 DSH 推进到新的 prerelease 时：

1. 先识别哪些面向 DSH 的 seam 真正发生变化；
2. 只重跑覆盖这些 seam 的 probe / conformance check；
3. 显式更新受影响的 package pin 与证据标签；
4. 与此次变化无关的层保持不动。

版本升级是兼容性工作，不是把上游责任吸收到本仓库里的理由。如果新版本已经暴露所需 seam，就直接使用；如果 seam 属于生态但仍缺失，就定义最小、可复用的标准 / 上游提案；如果根本没有可靠 enforcement point，就明确写出边界，而不是制造脆弱的本地 fork。

## 工具链

- **pnpm** `>= 11`（构建脚本政策在 `pnpm-workspace.yaml` 中）。
- **TypeScript** `>= 6.0`（构建基线；`tsconfig.base.json`）。

## 内核不变量

内核只依赖 Cordis —— 无 transport/vendor 运行时依赖（JWT / PostgreSQL / HTTP / MCP / Redis）。由 `scripts/verify-packages.mjs`（CI 门）强制，而非靠约定。
