[English](./web-seam-map.md) | 简体中文

# DSH Web 多租户 Seam 图

> 基于 `deepseek-ai/deepseek-harness` @ `47f943859bef60e4160492346772ded9b24f765a`
> （master，2026-08-15）。初步判定由可执行原型细化；最终判定落在 `../adr/web-enforcement.md`。
>
> **本图成文后已收敛**（见 ADR）：**H1**（create→claim 原子性）由 Agent `setup` 钩子解决 —— 准入在 `sessions.enter` 之前运行（M4 ②-A 运行时证明）。**H4**（respond）可经 facade 的 `api.respond` 包装解决。**H3**（principal 传播）仍是唯一上游缺口；**H2**（资源模型）仍延后。

## 1. 概述

DSH Web 暴露**五个**与授权相关的 surface，按 **Resource × Access Shape → Enforcement**（而非按 transport）组织：

| # | Surface | Shape | Enforcement | Seam |
|---|---|---|---|---|
| 1 | Unary RPC（`session.history`，…） | Point / Collection | Guard / Filter | `/api` `rpc.intercept()` |
| 2 | `events.mux` | Stream | Filter | `ApiProxy.events.mux()` |
| 3 | `events.host` | Stream | Filter / deny | `ApiProxy.events.host()` |
| 4 | `/api/respond`（approval/question） | Response | Guard | `toFetchHandler` 特例 |
| 5 | `session.create` / `fork` | Create | Atomic claim | `core/session` 生命周期 |

## 2. 矩阵

| Resource | Operation | Shape | Enforcement | Physical seam | Evidence | 初步判定 |
|---|---|---|---|---|---|---|
| Session | `history` `prompt` `rename` `fork` `cancel` `models` `selectModel` `attachment` `updateQueue` | Point | Guard | `/api` unary | handler `(endpoint, payload, signal)`；payload 携带 `sessionId` | **可守卫**；principal 传播待定（→H3） |
| Session | `list` `search` | Collection | Filter | `/api` unary | `session.list`/`session.search` 返回全部（无 `sessionId`） | **可过滤**；同一传播问题（→H3） |
| Session | `create` `fork` | Create | Atomic claim | Agent `setup` 钩子 | 准入在 `setup` 内、`sessions.enter` 之前运行（无窗口） | **经 `setup` 原子**（H1 已解决 — ADR） |
| Session | mux frames | Stream | Filter | `events.mux` | 全 session 聚合（`ctx.sessions.list()` 循环）；除 `stream/error` 外的每个 frame 都以 `sessionId` 为键 | **仅能经 facade/上游过滤**（→H3） |
| Approval/Question | `respond` | Response | Guard | `/api/respond` | `clientResponseSchema`，非 `ClientRequest`；不在 `rpc.intercept()` 内 | **未被 unary intercept 覆盖**（→H4） |
| Workspace | host frames | Stream | Filter / deny | `events.host` | `HostFrame` 混合 session + workspace + host-global | **需要资源模型**（→H2） |

## 3. Unary RPC surface（`RpcMethodMap` — 封闭 typed union）

`/api` unary surface 是一个**生成的、封闭 union**（编译进 Typert 注册表；`rpc.intercept('/api', …)` 解码 `endpoint` + `payload`）。这正使**编译期穷举覆盖**变得可行：插件可以分类每一个成员，并在 DSH 新增方法时构建失败。

命名空间 / 方法（共 52 个）：

| 命名空间 | 方法 | 承载 sessionId |
|---|---|---|
| `session.*` | `list` `search` `create` `history` `models` `selectModel` `rename` `fork` `prompt` `attachment` `updateQueue` `cancel` | 除 `list`/`search`/`create` 外全部 |
| `subagent.*` | `list` `history` `prompt` `interrupt` | 全部（`parentSessionId`） |
| `host.*` | `describe` `pickDirectory` `listDirectory` `createDirectory` `openPath` | 无（host-global） |
| `workspace.*` | `list` `create` `rename` `delete` `insertBefore` `insertSessionBefore` `archiveSession` | `archiveSession`/`insertSessionBefore` 引用 session（workspace 作用域） |
| `goal.*` | `create` `edit` `pause` `resume` `complete` `clear` | 全部（`sessionId`） |
| `skill.*` | `list` | `sessionId` |
| `agentPreset.*` | `list` `select` `read` `copy` `openDocument` `remove` | `select`（`sessionId`） |
| `settings.*` | `describe` `openDocument` `update` `replace` `mutate` | 无 |
| `credentials.*` | `describe` `set` `unset` | 无 |
| `llm.*` | `providers` `models` `discoverModels` | 无 |

**强制含义**：session 为键的方法是 POINT guard（`assertSessionAccess(principal, payload.sessionId)` —— `subagent.*` 则为 `payload.parentSessionId`）；`session.list`/`search` 是 COLLECTION filter；`host.*` / `workspace.*` 是 host-global DENY；其余是全局配置 ALLOW。这已落为 `dsh-multi-tenant-web` 中可执行的 `CLASSIFICATION` 表 —— 新增 DSH 方法会令 `tsc` 失败，而非静默地作为未分类通过。悬而未决的是 **principal**（→H3），而非 `sessionId`（`payload` 已携带）。

## 4. 流 surface

### 4.1 `events.mux` — `MuxFrame`（全 session 聚合）

```ts
type MuxFrame =
  | { type: 'session/event'; sessionId; … }
  | { type: 'session/subscribed'; sessionId; … }
  | { type: 'approval/requested'; sessionId; approvalId; … }
  | { type: 'approval/resolved'; sessionId; … }
  | { type: 'question/requested'; sessionId; … }
  | { type: 'question/resolved'; sessionId; … }
  | { type: 'session/queue'; sessionId; … }
  | { type: 'session/jobs'; sessionId; … }
  | { type: 'session/projection'; sessionId; … }
  | { type: 'stream/error'; error }        // ← 无 sessionId
```

除 `stream/error` 外的每个 frame 都以 `sessionId` 为键 → 可由「principal 能否访问 sessionId」过滤。聚合点是整个流的过滤问题（→H3）。

### 4.2 `events.host` — `HostFrame`（混合资源）

```ts
type HostFrame =
  | { type: 'host/session-added'; sessionId; … }
  | { type: 'host/session-removed'; sessionId }
  | { type: 'host/session-status'; sessionId; … }
  | { type: 'host/agent-error'; sessionId; … }
  | { type: 'host/workspace-changed'; workspace }            // ← workspace
  | { type: 'host/workspace-removed'; workspaceId }          // ← workspace
  | { type: 'host/workspace-order-changed'; workspaceIds }   // ← workspace
  | { type: 'host/archived-sessions-changed'; archivedSessionIds }  // ← list
  | { type: 'host/remote-event'; event; args }               // ← host-global
  | { type: 'stream/error'; error }
```

`events.host` **不是**纯粹的 session 流 —— 它携带 Workspace 与 host-global frame。这正迫使资源所有权问题浮出（→H2）：Workspace 是否由租户拥有？若是，`SessionOwner` 不够。若否，多租户模式下必须拒绝哪些 host frame？

## 5. `/api/respond`（双向）

Approval/question 是服务端发起的：`approval/requested` → 浏览器应答 → 携带 `ClientResponse`（`clientResponseSchema`）的 `POST /api/respond`，**而非** `ClientRequest`。unary `rpc.intercept()` 路径只解码 `ClientRequest`；`toFetchHandler` 特判 `/api/respond`。响应 payload 携带 `sessionId`，因此所有权**是**可检查的 —— 但与 unary 路径之间没有共享 seam（→H4）。经 facade 的 `api.respond` 包装解决（ADR）。

## 6. Seam 与缺口（→ 硬结论）

| 缺口 | Evidence | 导向 |
|---|---|---|
| Unary handler 无 principal/Request | `ConnectionRpcHandler = (endpoint, payload, signal)` | H3 |
| Mux/host 流是全局的 | `WebSocketDownlinks` 持有一个 `ApiProxy`；`events.mux` 聚合 `ctx.sessions.list()` | H3 |
| `/api/respond` 绕过 unary intercept | `toFetchHandler` 中的 `clientResponseSchema` 特例 | ~~H4~~ 已解决（facade `api.respond` 包装） |
| ~~create→claim 竞态~~ | `session.create(id?: SessionId)`；core 无 `release`/`reassign` | ~~H1~~ 已解决（`setup` 钩子，M4 ②-A） |
| host 流暴露 Workspace + host-global | `HostFrame` union 含 `workspace-*`、`remote-event` | H2 |

## 7. 生态备注

- **过期的 `latest` dist-tag。** `@deepseek-ai/dsh-{host-apiproxy,session,client-connection,tools}` 发布 `latest` → `0.0.1-rc.1`，而最新发布版本是 `0.1.0-rc.6`。消费者必须 pin 显式 prerelease 版本（`…@0.1.0-rc.6`），绝不用 `latest`。这对第三方插件是个陷阱，也关系到 `dsh-multi-tenant-web` 如何声明 DSH 依赖。
- **`ApiProxy` 形态。** 真实 surface 是一个大型命名空间对象（`sessions` / `subagents` / `host` / `workspace` / `skills` / `agentPresets` / `events` / `goals` / `settings` / `credentials` / `llm` / `respond`），其方法被包裹在 `RpcRequest`/`RpcResponse` 中。原型的 `ApiSurface` 是对承载 session 子集的 spike 局部简化。
