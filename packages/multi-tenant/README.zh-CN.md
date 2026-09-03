[English](./README.md) | 简体中文

# dsh-multi-tenant

`dsh-multi-tenant@0.4.0-alpha.2` 是面向 Node 22.19+ / Node 24 的 DSH 多租户插件，精确固定 `@deepseek-ai/*@0.1.2-alpha.5`。

这个 alpha 用于宿主集成和契约反馈。它提供一条精简的 authority path：从服务端创建的 Principal，到有明确所有者的 DSH Agent、持久本地 Directory 和 Agent-scoped MCP 生命周期。它假定宿主已经提供可信认证，并负责强于默认逻辑边界的隔离。

## 安装

npm 分发产物可用后，可以使用 alpha channel，或精确固定本次已审查的构建：

```bash
pnpm add dsh-multi-tenant@alpha
# 或精确固定本次已审查的预发布版本
pnpm add dsh-multi-tenant@0.4.0-alpha.2
```

在 `0.4.0` 稳定版之前，`alpha` channel 仍可能引入 provider 契约的源码破坏；需要可复现部署时应固定精确版本。本次源码由 `v0.4.0-alpha.2` tag 标识；npm artifact 和 GitHub prerelease 的发布仍是独立的显式 release 操作。

在 DSH 的 `agents` 和 `tools` service 之后加载。宿主没有提供替代实现时，插件使用 `.dsh-multi-tenant/agents.sqlite`、空 MCP 声明和 DSH 进程内 shared runtime：

```ts
import * as MultiTenant from 'dsh-multi-tenant'

await ctx.plugin(MultiTenant, { minimumIsolation: 'logical' })
```

在 Unix 上，默认目录会被强制设为 `0700`，数据库为 `0600`；已有路径也会收紧，无法设置权限时启动失败。通过 `DSH_MULTI_TENANT_DB_PATH` 或 `sqlite.path` 指定的路径由宿主管理，插件不会 chmod 该路径或父目录；ACL、备份和加密由宿主负责。Windows 部署必须由宿主配置等价 ACL。插件不会迁移 `0.3` ownership 数据或未发布候选 schema。

内置 SQLite Repository 打开时，会在 service 安装前原子地把所有遗留 `provisioning` 转为终态 `failed`，完成 [#49](https://github.com/GuoMonth/dsh-multi-tenant/issues/49)。这些资源在产品 API 中仍是 not-found，永远不会 resume；重试会获得全新的 Agent 和 session identity。该行为假定宿主保证此数据库只有一个活动进程。

## 最小 API

宿主先完成认证，再创建 `PrincipalContext`；请求 JSON 永远不是 Principal。

```ts
import { createPrincipalContext } from 'dsh-multi-tenant'

const principal = createPrincipalContext({
  tenantId: authenticated.tenantId,
  principalId: authenticated.subjectId,
})
const agent = await ctx.multiTenant.create(principal)

const result = await ctx.multiTenant.withAgent(principal, agent.id, runtime =>
  runtime.executeTool('mcp__erp__find_customer', { customerId: 'C-42' }),
)

await ctx.multiTenant.delete(principal, agent.id)
```

`create()` 同时生成公开 `AgentId` 和独立的内部 DSH session id。`get/list/withAgent/delete` 的查询都同时限定 Agent、Tenant、Principal。未知、越权、失败和已删除资源统一表现为 `AgentNotFoundError`。

`withAgent()` 是唯一可信运行入口。回调只有 `followup/steer/inject/cancel/whenIdle/executeTool`，拿不到 DSH session id、原始 Agent handle、Cordis context 或 disposer。

每个 runtime view 都是 callback-scoped：回调 resolve/reject、delete、能力撤销/刷新或 service shutdown 时立即失效。保留的旧 view 再调用任何方法都会得到 `CapabilityUnavailableError`。

## 真实 MCP

在根插件之前注册宿主 provider。官方 `dsh-mcp-client` 会在 unpublished Agent setup 内加载，因此不同 Agent 可以直接复用同一个逻辑 `serverName`，无需哈希改名：

```ts
import { StaticSecretProvider, StaticTenantMcpProvider } from 'dsh-multi-tenant'

await ctx.plugin(StaticTenantMcpProvider, {
  revision: 'erp-v1',
  servers: [{
    transport: 'stdio',
    serverName: 'erp',
    command: process.execPath,
    args: ['/opt/my-erp-mcp/server.mjs'],
    secretEnv: { API_TOKEN: { secret: 'erp-token', prefix: 'Bearer ' } },
  }],
})
await ctx.plugin(StaticSecretProvider, {
  revision: 'dev-secrets-v1',
  values: { 'erp-token': process.env.ERP_TOKEN! },
})
await ctx.plugin(MultiTenant)
```

Static provider 只用于开发。生产宿主通常实现 `TenantMcpProvider` 和 `SecretProvider`；`SecretLease` 的 value 只在内存中，同时提供 revision、撤销 signal 和 disposer。撤销会 cancel/dispose 当前 live Agent；下次授权使用会获取新 lease，并用同一内部 session resume。

宿主 provider acquisition 会收到必填 lifecycle signal，完成 [#50](https://github.com/GuoMonth/dsh-multi-tenant/issues/50)。MCP 和 Secret provider 接收 service signal；runtime partition 和 DSH driver 接收它与 SecretLease revoke signal 的组合：

```ts
load(principal, signal: AbortSignal): Promise<TenantMcpSnapshot>
acquire(principal, names, signal: AbortSignal): Promise<SecretLease>
acquire({ principal, agentId, requiredIsolation, signal }): Promise<RuntimePartitionLease>
```

Provider 应在工作前检查 signal、在可行时及时停止、提供稳定 revision，并保证 dispose 幂等。插件会在 DSH 工作前校验并冻结 provider 返回的能力视图。Abort 仍是合作式协议，不能强制终止任意宿主代码。

## Web adapter

`dsh-multi-tenant/web` 使用现有 DSH `ctx.webServer.register()` 挂载认证后的 CRUD：

```ts
import { mountMultiTenantWeb } from 'dsh-multi-tenant/web'

mountMultiTenantWeb(ctx, ctx.multiTenant, {
  principalProvider: {
    async authenticate(request) {
      const identity = await authenticateProductRequest(request)
      return identity && createPrincipalContext(identity)
    },
  },
  resolveAgentProfile(principal, profile) {
    if (profile === 'coding') {
      return {
        agentOptions: { provider: 'trusted-provider', model: 'trusted-coder' },
        meta: { cwd: trustedWorkspaceFor(principal) },
      }
    }
  },
})
```

路由为 `POST/GET /_dsh-multi-tenant/agents` 和 `GET/DELETE /_dsh-multi-tenant/agents/:id`。创建 body 只能是使用宿主默认值的 `{}`，或 `{ "profile": "coding" }`；只有已认证宿主的 resolver 能把名称转换成可信 DSH options。身份、session、原始 Agent options、metadata 和任何未知字段都会被拒绝。认证、输入、隐藏资源、能力/隔离不可用、DSH provisioning 失败分别返回 401、400、404、503、502。

## 保证与边界

- SQLite 使用 CAS revision 和 Principal-scoped SQL；已授权删除会立即使 active callback view 失效并预留串行屏障，后发 `withAgent()` 不能越过删除，只会在已清理的 tombstone 提交后得到 not-found。
- DSH setup 和数据库 ready transition 都成功后，Agent 才会公开。
- 每个 Agent 的 create/resume/refresh/delete 串行；并发打开 single-flight；插件关闭会 cancel 并 drain 全部 handle。
- Alpha.2 会把 lifecycle abort 传入 MCP、Secret、RuntimePartition 和 DSH setup，并在使用前校验 provider 结果。Drain 仍是 cooperative 的：忽略 abort 或永不结束的代码可能无限延迟 delete/shutdown；强制中断和任意默认 timeout 不在范围内。
- 最低隔离配置为 `strong` 时，共享逻辑 provider 会在创建 DSH Agent 前 fail closed。
- `TenantAgentRepository`、`TenantMcpProvider`、`SecretProvider`、`RuntimePartitionProvider`、`DshRuntimeDriver` 是宿主替换协议，统一通过 Cordis service 组合。
- 默认 shared provider 只是进程内逻辑隔离，不能隔离 hostile plugin/tool、filesystem、subprocess、内存或网络。
- SQLite 默认只支持 local、single-node、single-active-process；宿主部署必须维持这个约束，插件不会用 lock、heartbeat 或 fencing 强制证明。启动时会在 Agent 操作前确定性地失败遗留 provisioning。自定义 `TenantAgentRepository` 必须在注册前完成其拓扑需要的恢复；需要多进程协调或不同持久化边界时应替换该实现。
- 删除不承诺物理擦除 DSH 持久日志。
- 本版本不提供 Typert 公网 adapter，因为 stock Typert 不能建立可信 Principal 绑定。Stock DSH `/api` 必须保持私有/管理用途。

公共代码/API 子路径只有 `/mcp`、`/sqlite`、`/web`、`/testing`、`/starter`。此外还公开 `./cordis.patch.yml`，它是 DSH loader 配置 artifact，不是 JavaScript API。
