[English](./README.md) | 简体中文

# dsh-multi-tenant

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的可组合多租户 / SaaS 插件套件。

> **阶段：工程地基。** 内核基线已建立并由测试锁定；其公共契约仍处于预发布状态。套件围绕内核一次一个插件地生长。参见 [ROADMAP.md](./ROADMAP.md)。

## 这是什么

一个**插件家族**，而非单个插件。内核 —— `dsh-multi-tenant` —— 拥有租户/会话契约（身份、所有权、默认拒绝式授权）。本仓库以可独立发布的 [Cordis](https://github.com/cordiverse/cordis) 插件形式发布官方默认实现（存储、Web 强制、……），每个插件都遵循 DSH 的 service/bundle 逻辑，且每个都可以被通过同一套契约测试的第三方实现替换。

维护一套完整的默认技术栈之所以重要，是因为只有这样才能让单一方持有**端到端的租户隔离不变量** —— 租户 A 永远无法跨 auth → RPC → session → MCP → 下游触达租户 B —— 而这是任何单个插件的单元测试都无法证明的。

## 指导原则

- **典型的能力分层** —— *契约*（一个原生 DSH/Cordis seam：Service、事件或协议）→ *提供方*（插件）→ *组合*（`cordis.patch.yml` bundle），*在适用时*。纯集成 / 安全边界插件直接对原生 seam 组合。
- **单向依赖** —— 内核只拥有跨套件的最小租户原语，并且不依赖任何 transport 或 vendor 特定的东西（无 JWT、无 PostgreSQL、无 HTTP、无 MCP、无 Redis）；能力包拥有自己的契约，且可以依赖内核的原语。
- **按可替换的能力拆分，而非按大小** —— 且单个安全不变量不会被拆分到多个包。
- **默认 ≠ 唯一** —— 套件发布默认实现；只要通过同一套契约测试，第三方可以替换任何一层。

关于本仓库的开发方式，参见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

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
