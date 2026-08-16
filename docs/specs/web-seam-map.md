[简体中文](./web-seam-map.zh-CN.md) | English

# DSH Web Multi-Tenant Seam Map

> Based on `deepseek-ai/deepseek-harness` @ `47f943859bef60e4160492346772ded9b24f765a`
> (master, 2026-08-15). Preliminary verdicts are refined by the executable
> prototype; final verdicts land in `../adr/web-enforcement.md`.
>
> **Converged since this map was written** (see the ADR): **H1** (create→claim
> atomicity) is resolved by the Agent `setup` hook — admission runs before
> `sessions.enter` (runtime-proven M4 ②-A). **H4** (respond) is solvable via the
> facade's `api.respond` wrap. **H3** (principal propagation) remains the one
> upstream gap; **H2** (resource model) stays deferred.

## 1. Summary

DSH Web exposes **five** authorization-relevant surfaces, organized by
**Resource × Access Shape → Enforcement** (not by transport):

| # | Surface | Shape | Enforcement | Seam |
|---|---|---|---|---|
| 1 | Unary RPC (`session.history`, …) | Point / Collection | Guard / Filter | `/api` `rpc.intercept()` |
| 2 | `events.mux` | Stream | Filter | `ApiProxy.events.mux()` |
| 3 | `events.host` | Stream | Filter / deny | `ApiProxy.events.host()` |
| 4 | `/api/respond` (approval/question) | Response | Guard | `toFetchHandler` special-case |
| 5 | `session.create` / `fork` | Create | Atomic claim | `core/session` lifecycle |

## 2. Matrix

| Resource | Operation | Shape | Enforcement | Physical seam | Evidence | Preliminary verdict |
|---|---|---|---|---|---|---|
| Session | `history` `prompt` `rename` `fork` `cancel` `models` `selectModel` `attachment` `updateQueue` | Point | Guard | `/api` unary | handler `(endpoint, payload, signal)`; payload carries `sessionId` | **Guardable**; principal propagation open (→H3) |
| Session | `list` `search` | Collection | Filter | `/api` unary | `session.list`/`session.search` return everything (no `sessionId`) | **Filterable**; same propagation issue (→H3) |
| Session | `create` `fork` | Create | Atomic claim | Agent `setup` hook | admission in `setup` runs before `sessions.enter` (no window) | **Atomic via `setup`** (H1 resolved — ADR) |
| Session | mux frames | Stream | Filter | `events.mux` | all-session aggregated (`ctx.sessions.list()` loop); every frame except `stream/error` is `sessionId`-keyed | **Filterable only via facade/upstream** (→H3) |
| Approval/Question | `respond` | Response | Guard | `/api/respond` | `clientResponseSchema`, not a `ClientRequest`; not in `rpc.intercept()` | **Not covered by unary intercept** (→H4) |
| Workspace | host frames | Stream | Filter / deny | `events.host` | `HostFrame` mixes session + workspace + host-global | **Requires resource model** (→H2) |

## 3. Unary RPC surface (`RpcMethodMap` — closed typed union)

The `/api` unary surface is a **generated, closed union** (compiled into the
Typert registry; `rpc.intercept('/api', …)` decodes `endpoint` + `payload`).
This is what makes **compile-time exhaustive coverage** feasible: the plugin can
classify every member and fail to build when DSH adds a new one.

Namespaces / methods (52 total):

| Namespace | Methods | sessionId-bearing |
|---|---|---|
| `session.*` | `list` `search` `create` `history` `models` `selectModel` `rename` `fork` `prompt` `attachment` `updateQueue` `cancel` | all except `list`/`search`/`create` |
| `subagent.*` | `list` `history` `prompt` `interrupt` | all (`parentSessionId`) |
| `host.*` | `describe` `pickDirectory` `listDirectory` `createDirectory` `openPath` | none (host-global) |
| `workspace.*` | `list` `create` `rename` `delete` `insertBefore` `insertSessionBefore` `archiveSession` | `archiveSession`/`insertSessionBefore` reference sessions (workspace-scoped) |
| `goal.*` | `create` `edit` `pause` `resume` `complete` `clear` | all (`sessionId`) |
| `skill.*` | `list` | `sessionId` |
| `agentPreset.*` | `list` `select` `read` `copy` `openDocument` `remove` | `select` (`sessionId`) |
| `settings.*` | `describe` `openDocument` `update` `replace` `mutate` | none |
| `credentials.*` | `describe` `set` `unset` | none |
| `llm.*` | `providers` `models` `discoverModels` | none |

**Enforcement implication**: session-keyed methods are POINT guards
(`assertSessionAccess(principal, payload.sessionId)` — or `payload.parentSessionId`
for `subagent.*`); `session.list`/`search` are COLLECTION filters; `host.*` /
`workspace.*` are host-global DENY; the rest are global-config ALLOW. This is now
the executable `CLASSIFICATION` table in `dsh-multi-tenant-web` — a new DSH
method fails `tsc` rather than silently passing as unclassified. The
**principal** is the open question (→H3), not the `sessionId` (which `payload`
already carries).

## 4. Stream surfaces

### 4.1 `events.mux` — `MuxFrame` (all-session aggregated)

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
  | { type: 'stream/error'; error }        // ← no sessionId
```

Every frame except `stream/error` is `sessionId`-keyed → filterable by
`principal can access sessionId`. The aggregation point is the whole-stream
filter problem (→H3).

### 4.2 `events.host` — `HostFrame` (mixed resource)

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

`events.host` is **not** a pure session stream — it carries Workspace and
host-global frames. This is what forces the resource-ownership question (→H2):
is Workspace tenant-owned? If yes, `SessionOwner` is insufficient. If no,
which host frames must be denied in multi-tenant mode?

## 5. `/api/respond` (bidirectional)

Approval/question is server-initiated: `approval/requested` → browser answers →
`POST /api/respond` with a `ClientResponse` (`clientResponseSchema`), **not** a
`ClientRequest`. The unary `rpc.intercept()` path decodes `ClientRequest` only;
`toFetchHandler` special-cases `/api/respond`. The response payload carries
`sessionId`, so ownership **is** checkable — but there is no shared seam with the
unary path (→H4). Resolved by the facade's `api.respond` wrap (ADR).

## 6. Seams and gaps (→ Hard Conclusions)

| Gap | Evidence | Feeds |
|---|---|---|
| Unary handler has no principal/Request | `ConnectionRpcHandler = (endpoint, payload, signal)` | H3 |
| Mux/host streams are global | `WebSocketDownlinks` holds one `ApiProxy`; `events.mux` aggregates `ctx.sessions.list()` | H3 |
| `/api/respond` bypasses unary intercept | `clientResponseSchema` special-case in `toFetchHandler` | ~~H4~~ resolved (facade `api.respond` wrap) |
| ~~create→claim race~~ | `session.create(id?: SessionId)`; core has no `release`/`reassign` | ~~H1~~ resolved (`setup` hook, M4 ②-A) |
| host stream exposes Workspace + host-global | `HostFrame` union includes `workspace-*`, `remote-event` | H2 |

## 7. Ecosystem notes

- **Stale `latest` dist-tags.** `@deepseek-ai/dsh-{host-apiproxy,session,client-connection,tools}`
  publish `latest` → `0.0.1-rc.1` while the newest published version is
  `0.1.0-rc.6`. Consumers must pin an explicit prerelease version
  (`…@0.1.0-rc.6`), never `latest`. This is a footgun for third-party plugins
  and matters for how `dsh-multi-tenant-web` declares DSH deps.
- **`ApiProxy` shape.** The real surface is a large namespace object
  (`sessions` / `subagents` / `host` / `workspace` / `skills` / `agentPresets` /
  `events` / `goals` / `settings` / `credentials` / `llm` / `respond`), with
  methods wrapped in `RpcRequest`/`RpcResponse`. The prototype's `ApiSurface`
  is a spike-local simplification of the session-bearing subset.
