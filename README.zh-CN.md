[English](./README.md) | 简体中文

# dsh-multi-tenant

让 DeepSeek Harness（DSH）真正成为 **Multi-Tenant Runtime**，并在不替换 Cordis / DSH 生命周期语义的前提下提供可组合的 **SaaS Framework Core**。

> 已发布基础：`dsh-multi-tenant@0.2.0-rc.3`。
>
> 当前 v0.3 主线：**M5 真实 DSH-native MCP Tools Agent Integration 已实现并有 executable evidence；下一步只做 `0.3.0-rc.1` release convergence。**
>
> 当前 pinned DSH baseline：`0.1.1-rc.2` / `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；CI 不追 floating `latest` / `master`。

## Product Path

```text
Product / Transport authentication
        ↓ already trusted subject
Product Ingress
        ↓ TenantPrincipal
RuntimeComposition                 exact whole-plan attestation
        ↓
canonical Tenant                   Tenant MCP config
        ↓
canonical Principal                Principal Credentials
        ↓
one-shot create/resume Operation   authorization + immutable snapshot
        ↓
Principal-owned DSH Agent          long-lived
        ↓ setup before publication
官方 @deepseek-ai/dsh-mcp-client
        ↓
native Agent-scoped MCP Tools
```

边界保持明确：

- 产品自己负责 authentication；
- Product Ingress 只解析 trusted identity；
- RuntimeComposition 防止 Plan 混搭；
- Tenant / Principal 通过 Cordis 持有 typed Runtime capabilities；
- Operation 只拥有一次 create/resume decision，不拥有 Agent 长生命周期；
- live Agent 由 Principal 持有，并随 Principal teardown 回收；
- MCP transport / protocol 交给官方 DSH MCP client；
- hostile-code strong isolation 仍属于 process / container / Pod boundary。

## M4 Foundation

M4 已经建立：

- exact `CompositionPlan <-> RuntimeComposition` binding / attestation；
- trusted Product Ingress -> canonical Principal；
- `PrincipalCredentials` 作为可替换的 Principal-scoped low-level capability。

`PrincipalCredentials` 对当前 v0.3 很有用，但不代表 raw credential 是最终 Agent-facing abstraction。详见 `docs/specs/m4-product-ingress-credentials.zh-CN.md` 与非绑定 Vision `docs/vision/authority-capabilities.zh-CN.md`。

## M5：真实 MCP Agent Integration

M5 新增：

- `tenantMcpConfig: CapabilityToken<TenantMcpConfig, 'tenant'>`；
- `defineTenantMcpConfigProvider()`，支持 per-Tenant stdio / Streamable HTTP MCP config；
- credential binding 只在 Agent setup 中从 Principal Credentials 注入 MCP env / header；
- `createMcpAgentIntegration(principal)` 负责安全 create / resume；
- per Principal Session deterministic physical MCP namespace，兼容 pinned 官方 client 的 root-wide `serverName` reservation；
- Agent-scoped native DSH MCP Tools；
- create / resume 的 fail-closed Session ownership。

产品使用路径刻意很短：

```ts
const plan = compileSaaSDefinition({
  capabilities: [
    { capability: tenantMcpConfig, required: true },
    { capability: principalCredentials, required: true },
  ],
  providers: [mcpProvider, credentialsProvider],
})

const app = await materializeRuntimeComposition(ctx, plan)
const ingress = createProductIngress(app, resolveTrustedSubject)
const principal = await ingress.resolve(subject)
const mcp = createMcpAgentIntegration(principal)

const handle = await mcp.create({ sessionId })
```

`create()` 返回时，官方 MCP startup + 第一次 `tools/list` 已在 DSH Agent setup 内完成，因此 Agent 已经拥有 native MCP Tools。`resume()` 会在调用 DSH resume 前验证 durable Session ownership。

完整 contract / quick start 见 `docs/specs/m5-mcp-agent-integration.zh-CN.md` 和 `packages/multi-tenant/README.zh-CN.md`。

## Executable Evidence

GitHub Actions 在 Node 22.19 与 Node 24 上证明：

- exact pinned DSH source identity；
- Cordis lifecycle / one-shot Operation assumptions；
- 真实 DSH Agent caller ownership；
- 官方 MCP client root-wide namespace 行为；
- 使用 MCP SDK 的真实 stdio MCP server；
- 通过官方 `@deepseek-ai/dsh-mcp-client` 的真实 `tools/list`；
- 通过 DSH `ToolRuntime.execute()` 的真实 MCP Tool 调用；
- Acme/Alice、Acme/Bob、Globex/Alice 并发 config / credential isolation；
- cross-Principal resume 在 DSH factory 调用前拒绝；
- MCP startup failure 不留下 half-published Agent，但保留 fail-closed ownership reservation；
- Agent / Principal teardown 清理 MCP tools / connection；
- typecheck、unit / contract tests、build 与 packed external-consumer smoke。

## 下一步：v0.3.0-rc.1

第一个真正可用的 v0.3 prerelease 之前，不再开启新的架构 Milestone。下一步只做 release convergence：version bump、release note、v0.3 registry smoke、`pnpm release:check`，然后验证 exact npm artifact / Git tag / GitHub Release。

见 [Direction](./ROADMAP.zh-CN.md)。

## 长期原则

```text
Core identity / lifecycle
        ↓
Authority / Credential Broker plugin
        ↓
Service Integration plugin
        ↓
Typed Client / Transport capability
        ↓
Operation
```

> **Core 管身份和生命周期；Broker 管授权与 secret；Integration 管厂商协议；Operation 消费 typed ability；Secret 在可行时留在 authority boundary 后面。**

这仍然是 Vision，不进入本次 release scope。正式 public Broker contract 必须由第二个真实 integration（例如 ERP）挣出来。

## Public Subpaths

```text
dsh-multi-tenant
dsh-multi-tenant/runtime
dsh-multi-tenant/operation
dsh-multi-tenant/composition
dsh-multi-tenant/runtime-composition
dsh-multi-tenant/ingress
dsh-multi-tenant/credentials
dsh-multi-tenant/mcp
dsh-multi-tenant/store
dsh-multi-tenant/testing
```

## Security Boundary

Cordis Context 是 trusted same-process composition / lifecycle boundary，不是 hostile-code sandbox。M5 会减少正常路径中的 credential 暴露，但不能防御共享进程的恶意代码。Filesystem / process / network / shell / secret strong isolation 属于 container / Pod / sidecar / remote authority deployment profile。

## 安装

```sh
dsh plugin --profile <profile> add dsh-multi-tenant
```

## 验证

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

## License

MIT
