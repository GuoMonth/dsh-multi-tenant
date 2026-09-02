[English](./README.md) | 简体中文

# dsh-multi-tenant

`dsh-multi-tenant@0.4.0-alpha.1` 是面向 Node 22.19+ / Node 24 的 DSH 多租户插件，精确固定 `@deepseek-ai/*@0.1.2-alpha.5`。

## 安装

```bash
pnpm add dsh-multi-tenant@0.4.0-alpha.1
```

在 DSH 的 `agents` 和 `tools` service 之后加载。宿主没有提供替代实现时，插件使用 `.dsh-multi-tenant/agents.sqlite`、空 MCP 声明和 DSH 进程内 shared runtime：

```ts
import * as MultiTenant from 'dsh-multi-tenant'

await ctx.plugin(MultiTenant, { minimumIsolation: 'logical' })
```

可通过 `DSH_MULTI_TENANT_DB_PATH` 或 `sqlite.path` 修改 SQLite 路径。插件不会迁移或读取 `0.3` ownership 数据。

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

- SQLite 使用 CAS revision 和 Principal-scoped SQL；删除先撤销访问，只保留已清理的 tombstone。
- DSH setup 和数据库 ready transition 都成功后，Agent 才会公开。
- 每个 Agent 的 create/resume/refresh/delete 串行；并发打开 single-flight；插件关闭会 cancel 并 drain 全部 handle。
- 最低隔离配置为 `strong` 时，共享逻辑 provider 会在创建 DSH Agent 前 fail closed。
- `TenantAgentRepository`、`TenantMcpProvider`、`SecretProvider`、`RuntimePartitionProvider`、`DshRuntimeDriver` 是宿主替换协议，统一通过 Cordis service 组合。
- 默认 shared provider 只是进程内逻辑隔离，不能隔离 hostile plugin/tool、filesystem、subprocess、内存或网络。
- SQLite 默认只支持 local、single-node、single-process，不宣称 multi-process 或 multi-replica ownership；需要不同持久化边界时替换 Repository。本地进程唯一所有权由 [#49](https://github.com/GuoMonth/dsh-multi-tenant/issues/49) 跟踪。
- 删除不承诺物理擦除 DSH 持久日志。
- 本版本不提供 Typert 公网 adapter，因为 stock Typert 不能建立可信 Principal 绑定。Stock DSH `/api` 必须保持私有/管理用途。

公共子路径只有 `/mcp`、`/sqlite`、`/web`、`/testing`、`/starter`。
