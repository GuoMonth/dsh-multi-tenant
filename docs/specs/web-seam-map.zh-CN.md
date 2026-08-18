[English](./web-seam-map.md) | 简体中文

# DSH Web 多租户 Seam 图

> 基于 `deepseek-ai/deepseek-harness` @ `47f943859bef60e4160492346772ded9b24f765a`
> （master，2026-08-15）。初步判定由可执行证据不断细化；当前策略以 `../adr/web-enforcement.md` 为准。
>
> **本图最初成文后已收敛**：**H1**（create→claim 原子性）由 Agent `setup` 钩子解决 —— 准入在 `sessions.enter` 之前运行（M4 ②-A 运行时证明）。**H3**（principal 传播）仍是 ②-C 要验证的 transport 假设。**H4**（`respond`）原则上可由插件解决，但**尚未闭环**：真实 `ClientResponse` 只有 `rpcId + result`，没有 `sessionId`，因此授权需要 `rpcId → sessionId` 关联。**H2**（资源模型）仍延后。

## 1. 概述

DSH Web 暴露**五类**与授权相关的 surface，按 **Resource × Access Shape → Enforcement**（而非按 transport）组织：

| # | Surface | Shape | Enforcement | Seam |
|---|---|---|---|---|
| 1 | Unary RPC（`session.history`，…） | Point / Collection / Admission | Guard / Filter / Admit / Deny | 真实 `ApiProxy` facade |
| 2 | `events.mux` | Stream | Filter | `ApiProxy.events.mux()` |
| 3 | `events.host` | Stream | Filter / deny | `ApiProxy.events.host()` |
| 4 | `/api/respond`（approval/question） | Response | correlation 后 Guard | `toFetchHandler` 特例 |
| 5 | `session.create` / fork/subagent/resume | Create | 发布前所有权准入 | Agent `setup` |

## 2. 矩阵

| Resource | Operation | Shape | Enforcement | Physical seam | Evidence | 当前判定 |
|---|---|---|---|---|---|---|
| Session | `history` `prompt` `rename` `fork` `cancel` `models` `selectModel` `attachment` `updateQueue` | Point | Guard | 真实 `ApiProxy` facade | payload 携带 `sessionId` | **可守卫**；principal 绑定仍需 ②-C（→H3） |
| Session | `list` | Collection | Filter | 真实 `ApiProxy` facade | 当前 list 返回完整 baseline | **可正确 post-filter**；②-B 已实现 |
| Session | `search` | Query-scoped collection | v0 Deny | 真实 `ApiProxy` facade | 全局排序、最多 20 条 + `hasMore`；事后过滤会丢失本租户排名更靠后的结果 | **不能正确 post-filter**；需要 scoped query 语义 |
| Session | `create` | Create | Admit | Agent `setup` + transport bridge | setup 准入在 `sessions.enter` 之前运行；transport 仍缺 caller principal | **H1 已解；仍需 H3/②-C** |
| Session | fork / subagent | Create | Inherit | Agent `setup` | create options 中可拿到 parent id | **准入路径已运行时证明** |
| Session | resume | Create | Restore | Agent `setup` | `resumeSessionId` 可得；durable owner 为权威 | **准入路径已运行时证明** |
| Session | mux frames | Stream | Filter | `events.mux` | 全 session 聚合，session frame 有键 | **待 ②-C** |
| Approval/Question | `respond` | Response | correlation 后 Guard | `/api/respond` | incoming `ClientResponse` 只有 `rpcId`，没有 `sessionId`；外发 request / pending registry 能定位 session | **待 ②-C correlation 证明**（H4） |
| Workspace | host frames / workspace methods | Host/global resource | v0 Deny | facade / host stream | 尚无 tenant resource model | **H2 前 DENY** |
| Deployment management | settings / credentials / preset authoring / host-scoped LLM config | Host-global privileged surface | v0 Deny | 真实 `ApiProxy` facade | 会修改或暴露 deployment 级配置/能力 | **DENY** |

## 3. Unary RPC surface（`RpcMethodMap` — 封闭 typed map）

`/api` unary surface 是一个生成的封闭 map。`dsh-multi-tenant-web` 现在直接导入真实 `RpcMethodMap` 并定义：

```ts
Record<keyof RpcMethodMap, Category>
```

因此 DSH 新增方法或分类 key 拼错都会让 `tsc` 失败，而不是静默放过。运行时对未知字符串方法仍默认 `deny`。

命名空间 / 方法（共 52 个）：

| 命名空间 | 方法 | 多租户安全处理 |
|---|---|---|
| `session.*` | `list` `search` `create` `history` `models` `selectModel` `rename` `fork` `prompt` `attachment` `updateQueue` `cancel` | list=FILTER；search=DENY（待 scoped query）；create=ADMIT；其他 session-keyed 方法=GUARD |
| `subagent.*` | `list` `history` `prompt` `interrupt` | 在 `parentSessionId` 上 GUARD |
| `host.*` | `describe` `pickDirectory` `listDirectory` `createDirectory` `openPath` | DENY（host-global） |
| `workspace.*` | `list` `create` `rename` `delete` `insertBefore` `insertSessionBefore` `archiveSession` | H2 前 DENY |
| `goal.*` | `create` `edit` `pause` `resume` `complete` `clear` | 在 `sessionId` 上 GUARD |
| `skill.*` | `list` | 在 `sessionId` 上 GUARD |
| `agentPreset.*` | `list` `select` `read` `copy` `openDocument` `remove` | list=ALLOW（picker）；select=GUARD；authoring/inspection=DENY |
| `settings.*` | `describe` `openDocument` `update` `replace` `mutate` | DENY（deployment 配置） |
| `credentials.*` | `describe` `set` `unset` | DENY（deployment 凭据） |
| `llm.*` | `providers` `models` `discoverModels` | v0 DENY（host-scoped 配置/目录）；仍可使用受 GUARD 的 `session.models` |

这里的关键区别是：**没有 sessionId 不等于 ALLOW**。Host/global 权限面在建立明确资源/角色模型之前一律拒绝。

## 4. 流 surface

### 4.1 `events.mux` — `MuxFrame`（全 session 聚合）

session-bearing frame 在 connection 已绑定 principal 后可以按所有权过滤。无法归属 tenant 的 control/error frame 需要明确 redact 或 terminate 规则，不能直接归给任意租户。

### 4.2 `events.host` — `HostFrame`（混合资源）

`events.host` 混合 Session、Workspace 与 host-global frame。v0 因此只允许明确 session-keyed 且通过所有权检查的 frame，其余在 H2 定义 Workspace/host 资源所有权之前一律拒绝。

## 5. `/api/respond`（双向）

Approval/question 是服务端发起的：Host 发出一个带 `rpcId` 和 session-bearing payload 的 `ServerRequest`；浏览器再通过 `POST /api/respond` 回一个 `ClientResponse`。**incoming response 自己不带 `sessionId`** —— 只有 `rpcId` 和 `result`。

因此 tenant guard 必须维护或查询 pending correlation：

```text
outgoing server request
rpcId -> sessionId
        ↓
incoming ClientResponse(rpcId)
        ↓
resolve sessionId
        ↓
assertSessionAccess(principal, sessionId)
        ↓
api.respond(...)
```

当前 `bindTenant` 对它默认拒绝，仍属于 M4 ②-C。除非真实 transport 证明必须，否则不预设需要 respond 专用上游 seam。

## 6. Seam 与缺口

| 缺口 | Evidence | 状态 |
|---|---|---|
| Request/connection 尚无被证明的 principal 绑定点 | unary handler 丢失 Request；HTTP/WS 后进入共享服务 | H3 假设 —— ②-C 验证 |
| Mux/host 流是全局的 | shared `ApiProxy` / aggregated streams | ②-C |
| `/api/respond` 仅凭 `rpcId` 标识 pending interaction | 真实 `ClientResponse` 结构 | H4 correlation 待 ②-C 证明 |
| ~~create→claim 竞态~~ | Agent setup 在 `sessions.enter` 前执行准入 | ~~H1~~ 已解决（M4 ②-A） |
| host/workspace/config surface 无 tenant resource model | host-global contracts | DENY；H2 / 权限模型延后 |
| `session.search` 全局限量/排序 | max 20 + `hasMore` | scoped query seam/design 待定 |

## 7. 生态备注

- **过期的 `latest` dist-tag。** DSH prerelease tag 仍不稳定时，消费者 pin 显式 prerelease 版本，而不是依赖 `latest`。
- **真实 `ApiProxy`。** Web 包现在已经直接编译到真实 `@deepseek-ai/dsh-host-apiproxy/api` 契约；旧的 spike-local `ApiSurface` 已删除。
