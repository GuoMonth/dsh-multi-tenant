[English](./README.md) | 简体中文

# dsh-multi-tenant

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的可组合多租户插件原语。

> **阶段：第一次 kernel prerelease。** 内核基线已经建立并由测试锁定；公共契约仍处于 prerelease。当前 DSH 目标是 **`0.1.0-rc.7`**。面向发布的路线见 [ROADMAP.md](./ROADMAP.md)，精确 evidence/version 规则见 [`docs/reference/compatibility.md`](./docs/reference/compatibility.md)。

## 这是什么

这是一个**带小型 kernel 的插件家族**，不是“把整套 SaaS 平台都实现掉”的承诺。`dsh-multi-tenant` 只拥有本仓库能够直接强制的 tenant/session 原语：identity shape、不可变 session ownership、fail-closed authorization，以及 `TenantSessionStore` provider contract。

其他能力只有在边界真实、并且确实有价值时才进入项目。依赖 DSH 或第三方 seam 的事情，用最小 contract/conformance proposal 进行生态协作；当前无法可靠强制的 surface，则直接作为边界说明，而不是吸收到本地 fork 里。

## 指导原则

- **控制得住 → 严格强制** —— 本仓库拥有 enforcement point 的地方，规则必须 fail-closed，并用可执行测试锁住不变量。
- **需要生态协作 → 制定标准** —— 一个保证依赖 DSH 或其他可替换生态组件时，定义最小而有用的 seam/contract、发布一致性要求，并优先向上游协作。
- **控制不住 → 明确边界** —— 没有可靠 enforcement seam 的地方，直接说明 threat-model / support boundary。复杂度不是证据。
- **快速跟进 prerelease** —— 显式 pin DSH prerelease，记录 evidence 对应精确版本，只重新验证上游变化真正影响到的 seam。
- **单向依赖** —— kernel 没有 transport/vendor 依赖（无 JWT、PostgreSQL、HTTP、MCP、Redis）；provider 与 integration 保持在外层。
- **默认 ≠ 唯一** —— provider 通过相同共享 contract suite 即可替换；不能为了 roadmap 对称而把每一种 backend 都自己实现。

## 发布范围

第一次公开的 0.1 prerelease 是 **kernel package**。Production Web 多用户 enforcement 属于另一条受生态 seam 门控的路线：

- `dsh-multi-tenant` —— release candidate：ownership、authorization、store seam、testing utilities。
- `dsh-multi-tenant-web` —— experimental、fail-closed 的 enforcement spike；production principal binding 等待 DSH request/connection principal-scope seam。

0.1 版本线**不**声称提供 shell/filesystem/process/container/network isolation、billing/UI/组织管理、host-global resource tenancy 或跨用户 team ACL。完整边界矩阵见 [ROADMAP.md](./ROADMAP.md)。

## 包

| 包 | npm | 角色 |
| --- | --- | --- |
| [`packages/multi-tenant`](./packages/multi-tenant) | `dsh-multi-tenant` | Kernel：`ctx.multiTenant` + `ctx.tenantSessionStore`，claim-once ownership、fail-closed authorization、provider contract/testing。 |
| [`packages/multi-tenant-web`](./packages/multi-tenant-web) | `dsh-multi-tenant-web` | 实验性的 tenant-bound `ApiProxy` enforcement 研究；production principal binding 受 DSH transport seam 门控。 |

开发规范见 [CONTRIBUTING.md](./CONTRIBUTING.md)，layer 归属见 [`docs/specs/architecture.md`](./docs/specs/architecture.md)。

## 开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

根脚本通过 `pnpm -r` 委托给每个 workspace package。

## 许可证

MIT
