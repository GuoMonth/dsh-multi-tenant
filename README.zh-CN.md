[English](./README.md) | 简体中文

# dsh-multi-tenant

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的可组合多租户 / SaaS 插件套件。

> **阶段：工程地基。** 内核基线已建立并由测试锁定；其公共契约仍处于预发布状态。套件围绕内核一次一个插件地生长。当前 DSH 目标基线是 **`0.1.0-rc.7`**；精确的证据版本与 prerelease pinning 规则见 [`docs/reference/compatibility.md`](./docs/reference/compatibility.md)。路线顺序参见 [ROADMAP.md](./ROADMAP.md)。

## 这是什么

一个**插件家族**，而非单个插件。内核 —— `dsh-multi-tenant` —— 拥有租户/会话契约（身份、所有权、默认拒绝式授权）。本仓库以可独立发布的 [Cordis](https://github.com/cordiverse/cordis) 插件形式发布官方默认实现（存储、Web 强制、……），每个插件都遵循 DSH 的 service/bundle 逻辑，且每个都可以被通过同一套契约测试的第三方实现替换。

维护一套连贯的默认技术栈之所以重要，是因为这样本仓库才能对**自己真正控制的 surface** 持有并证明租户隔离不变量。这个承诺止于明确边界：依赖 DSH 或其他可替换生态组件的地方，通过契约、一致性测试和最小化的上游提案协作；本项目无法可靠强制的 surface，则明确写成边界，而不是用脆弱的本地复杂度把它包装成“看起来已经解决”。

## 指导原则

- **控制得住 → 严格强制** —— 本仓库拥有 enforcement point 的地方，规则必须 fail-closed，并用可执行测试锁住安全不变量。
- **需要生态协作 → 制定标准** —— 一个保证依赖 DSH 或其他可替换生态组件时，定义最小而通用的 seam / contract、发布一致性要求，并优先向上游协作。不要为了让本项目看起来更完整，就 fork 或重写整个上游子系统。
- **控制不住 → 明确边界** —— 没有可靠 enforcement seam 的地方，直接说明 threat model / support boundary。宁可明确承认限制，也不要引入实际上无法证明保证的工程复杂度。
- **快速跟进 prerelease** —— 显式 pin DSH prerelease，记录证据对应的精确版本，只重新验证上游变更影响到的 seam。历史 RC6 证据继续标记为 RC6；新的工作以 RC7 为目标，直到兼容性基线再次推进。
- **典型的能力分层** —— *契约*（一个原生 DSH/Cordis seam：Service、事件或协议）→ *提供方*（插件）→ *组合*（`cordis.patch.yml` bundle），*在适用时*。纯集成 / 安全边界插件直接对原生 seam 组合。
- **单向依赖** —— 内核只拥有跨套件的最小租户原语，并且不依赖任何 transport 或 vendor 特定的东西（无 JWT、无 PostgreSQL、无 HTTP、无 MCP、无 Redis）；能力包拥有自己的契约，且可以依赖内核的原语。
- **按可替换的能力拆分，而非按大小** —— 且单个安全不变量不会被拆分到多个包。
- **默认 ≠ 唯一** —— 套件发布默认实现；只要通过同一套契约测试，第三方可以替换任何一层。

关于本仓库的开发方式，参见 [CONTRIBUTING.md](./CONTRIBUTING.md)。完整文档见 [`docs/`](./docs/README.md)。

## 包

| 包 | npm | 角色 |
| --- | --- | --- |
| [`packages/multi-tenant`](./packages/multi-tenant) | `dsh-multi-tenant` | 内核：`ctx.multiTenant` + `ctx.tenantSessionStore`，一次性认领所有权，默认拒绝式授权。 |
| [`packages/multi-tenant-web`](./packages/multi-tenant-web) | `dsh-multi-tenant-web` | Web 强制：主体绑定，RPC/mux/WS 守卫（早期 spike）。 |

## 开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

根脚本通过 `pnpm -r` 委托给每个工作区包。

## 许可证

MIT
