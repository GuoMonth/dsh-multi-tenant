[English](./README.md) | 简体中文

# dsh-multi-tenant

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的可组合多租户插件原语。

> **阶段：kernel prerelease 版本线。** `0.1.0-rc.1` 已真实公开发布；当前收敛 candidate 是 **`0.1.0-rc.2`**。DSH target 仍为 **`0.1.0-rc.7`**。参见 [ROADMAP.md](./ROADMAP.zh-CN.md) 与 [`docs/reference/release.zh-CN.md`](./docs/reference/release.zh-CN.md)。

## 这是什么

这是一个**带小型 kernel 的插件家族**，不是“把整套 SaaS 平台都实现掉”的承诺。`dsh-multi-tenant` 只拥有本仓库能够直接强制的 tenant/session 原语：最小 tenant/user identity、不可变 session ownership、fail-closed authorization，以及 `TenantSessionStore` provider contract。

其他能力只有在边界真实且确实有价值时才进入项目。依赖 DSH/第三方 seam 的事情，用最小 contract/conformance proposal 进行生态协作；当前无法可靠强制的 surface 直接作为边界说明，而不是吸收到本地 fork。

## 指导原则

- **控制得住 → 严格强制** —— fail-closed，并用可执行 invariant 锁住。
- **需要生态协作 → 制定标准** —— 定义最小可用 seam/contract，并优先向上游协作。
- **控制不住 → 明确边界** —— 直接说明 threat-model/support boundary。复杂度不是证据。
- **快速跟进 prerelease** —— 显式 pin DSH prerelease，只重验受影响 seam。
- **单向依赖** —— kernel 不引入 JWT/PostgreSQL/HTTP/MCP/Redis 依赖。
- **默认 ≠ 唯一** —— provider 通过共享 contract suite 即可替换。

## 发布范围

- `dsh-multi-tenant` —— 已发布 kernel：ownership、authorization、store seam、testing utilities。
- `dsh-multi-tenant-web` —— private experimental enforcement spike；production principal binding 等待 DSH request/connection-scope seam。

0.1 版本线**不**声称提供 shell/filesystem/process/container/network isolation、billing/UI/组织管理、host-global resource tenancy、general RBAC 或跨用户 team ACL。Kernel `TenantPrincipal` 刻意不包含 roles/permissions。

## 包

| 包 | 分发 | 角色 |
| --- | --- | --- |
| [`packages/multi-tenant`](./packages/multi-tenant) | npm `dsh-multi-tenant@next` | Kernel：`ctx.multiTenant` + `ctx.tenantSessionStore`，claim-once ownership、fail-closed authorization、provider contract/testing。 |
| [`packages/multi-tenant-web`](./packages/multi-tenant-web) | private workspace | 实验性的 tenant-bound `ApiProxy` 研究；production principal binding 受 DSH transport seam 门控。 |

开发规范见 [CONTRIBUTING.md](./CONTRIBUTING.zh-CN.md)，layer 归属见 [`docs/specs/architecture.zh-CN.md`](./docs/specs/architecture.zh-CN.md)。

## 开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## 许可证

MIT
