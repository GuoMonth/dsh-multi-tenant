[English](./README.md) | 简体中文

# dsh-multi-tenant

`dsh-multi-tenant@0.6.0` 是面向 Node 22.19+ / Node 24 的 DSH 多租户插件，精确固定 DSH `0.1.5-rc.2` 和源码 commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`。

Principal API 和 SQLite Directory schema 延续 `0.4.0`，DSH 依赖基线明确切换。项目只支持精确目标，不维护多版本兼容层。宿主负责认证，以及强于默认逻辑边界的隔离。

## 安装

发布身份为 `v0.6.0`，npm 分发使用 `latest` dist-tag。同时固定插件与全部直接 DSH peer：

```bash
pnpm add dsh-multi-tenant@0.6.0 @deepseek-ai/cordis@4.0.2 \
  @deepseek-ai/dsh-agent@0.1.5-rc.2 @deepseek-ai/dsh-llm@0.1.5-rc.2 \
  @deepseek-ai/dsh-mcp-client@0.1.5-rc.2 @deepseek-ai/dsh-session@0.1.5-rc.2 \
  @deepseek-ai/dsh-tools@0.1.5-rc.2
```

DSH 仍是预发布版本。宿主应整体升级 DSH 依赖图。受支持的历史日志可能被 DSH 迁移为 V3，插件不实现数据迁移。升级前停止宿主并备份 Directory 与 DSH 数据；回滚必须同时恢复对应旧 runtime 和升级前数据，保留的旧日志不包含 V3 新增内容。

在 DSH 的 `agents`、`tools` 和 `sessions` service 之后加载，并在创建 Agent 前挂载 JSONL 等持久化 backend。宿主没有提供替代实现时，插件使用 `.dsh-multi-tenant/agents.sqlite`、空 MCP 声明和 DSH 进程内 shared runtime：

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

await ctx.multiTenant.send(principal, agent.id, 'Hello', { delivery: 'queue' })
await ctx.multiTenant.cancel(principal, agent.id)
const result = await ctx.multiTenant.executeTool(
  principal, agent.id, 'mcp__erp__find_customer', { customerId: 'C-42' },
)

await ctx.multiTenant.delete(principal, agent.id)
```

Shared driver 的 `create()` 会在 Directory 进入 ready 前完成 DSH session 持久化检查，尚无消息的空会话也会落盘。持久化 listener 缺失或失败时，创建失败并释放已获取的 Agent。自定义持久化 runtime driver 也必须在返回成功前完成自身的持久化边界。





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

- DSH setup、shared driver 的 session 持久化检查和数据库 ready transition 都成功后，Agent 才会公开。
- 每个 Agent 的 create/resume/refresh/delete 串行；并发打开 single-flight；插件关闭会 cancel 并 drain 全部 handle。
- 生命周期契约会把 abort 传入 MCP、Secret、RuntimePartition 和 DSH setup，并在使用前校验 provider 结果。Drain 仍是 cooperative 的：忽略 abort 或永不结束的代码可能无限延迟 delete/shutdown；强制中断和任意默认 timeout 不在范围内。
- 最低隔离配置为 `strong` 时，共享逻辑 provider 会在创建 DSH Agent 前 fail closed。
- `TenantAgentRepository`、`TenantMcpProvider`、`SecretProvider`、`RuntimePartitionProvider`、`DshRuntimeDriver` 是宿主替换协议，统一通过 Cordis service 组合。
- 默认 shared provider 只是进程内逻辑隔离，不能隔离 hostile plugin/tool、filesystem、subprocess、内存或网络。
- SQLite 默认只支持 local、single-node、single-active-process；宿主部署必须维持这个约束，插件不会用 lock、heartbeat 或 fencing 强制证明。启动时会在 Agent 操作前确定性地失败遗留 provisioning。自定义 `TenantAgentRepository` 必须在注册前完成其拓扑需要的恢复；需要多进程协调或不同持久化边界时应替换该实现。
- 删除不承诺物理擦除 DSH 持久日志。
- 本版本不提供 Typert 公网 adapter，因为 stock Typert 不能建立可信 Principal 绑定。Stock DSH `/api` 必须保持私有/管理用途。

公共代码/API 子路径只有 `/mcp`、`/sqlite`、`/web`、`/testing`、`/starter`。此外还公开 `./cordis.patch.yml`，它是 DSH loader 配置 artifact，不是 JavaScript API。

## 运行命令

`send(principal, id, text, { delivery: 'queue' | 'steer' })` 在原生输入准入后返回 `{ accepted: true }`，不等待模型完成，也不代表持久化确认。`cancel()` 只取消当前在线 generation，返回 cancelled 或 inactive，不恢复冷 Agent。`whenIdle()` 等待当前活动，也不激活冷资源。`executeTool()` 和 `inject()` 供可信宿主使用。

原 callback API 已删除。长工具操作和活动等待不持有生命周期队列；delete、refresh、撤销和 shutdown 封闭旧 generation、取消已接纳操作并在 drain 后释放 handle 和 provider 租约。持久删除失败时，本进程继续拒绝新命令，直到所有者重试删除。

Web 新增 `POST /_dsh-multi-tenant/agents/:id/messages`，body 为 `{ text, delivery? }`，以及 `POST .../:id/cancel`，body 为 `{ reason? }`。message source 由宿主构造，不提供浏览器任意工具执行入口。
