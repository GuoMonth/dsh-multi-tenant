[简体中文](./web-seam-map.zh-CN.md) | English

# DSH Web Multi-Tenant Seam Map

> Based on `deepseek-ai/deepseek-harness` @ `47f943859bef60e4160492346772ded9b24f765a`
> (master, 2026-08-15). Preliminary verdicts are refined by executable proof;
> current policy lives in `../adr/web-enforcement.md`.
>
> **Converged since this map was first written**: **H1** (create→claim atomicity)
> is resolved by the Agent `setup` hook — admission runs before `sessions.enter`
> (runtime-proven M4 ②-A). **H3** (principal propagation) remains the transport
> hypothesis to prove in ②-C. **H4** (`respond`) is plugin-solvable in principle
> but is **not closed yet**: the real `ClientResponse` carries `rpcId + result`,
> not `sessionId`, so authorization needs `rpcId → sessionId` correlation.
> **H2** (resource model) stays deferred.

## 1. Summary

DSH Web exposes **five** authorization-relevant surfaces, organized by
**Resource × Access Shape → Enforcement** (not by transport):

| # | Surface | Shape | Enforcement | Seam |
|---|---|---|---|---|
| 1 | Unary RPC (`session.history`, …) | Point / Collection / Admission | Guard / Filter / Admit / Deny | real `ApiProxy` facade |
| 2 | `events.mux` | Stream | Filter | `ApiProxy.events.mux()` |
| 3 | `events.host` | Stream | Filter / deny | `ApiProxy.events.host()` |
| 4 | `/api/respond` (approval/question) | Response | Guard after correlation | `toFetchHandler` special-case |
| 5 | `session.create` / fork/subagent/resume | Create | Pre-publication ownership admission | Agent `setup` |

## 2. Matrix

| Resource | Operation | Shape | Enforcement | Physical seam | Evidence | Current verdict |
|---|---|---|---|---|---|---|
| Session | `history` `prompt` `rename` `fork` `cancel` `models` `selectModel` `attachment` `updateQueue` | Point | Guard | real `ApiProxy` facade | payload carries `sessionId` | **Guardable**; principal binding still needs ②-C (→H3) |
| Session | `list` | Collection | Filter | real `ApiProxy` facade | current list returns the complete visible baseline | **Post-filterable**; implemented in ②-B |
| Session | `search` | Query-scoped collection | Deny for v0 | real `ApiProxy` facade | globally ranked/capped (20) + `hasMore`; post-filtering can discard tenant-owned lower-ranked matches | **Not correctly post-filterable**; needs scoped query semantics |
| Session | `create` | Create | Admit | Agent `setup` + transport bridge | setup admission runs before `sessions.enter`; caller principal is still missing at transport | **H1 solved; H3/②-C still required** |
| Session | fork / subagent | Create | Inherit | Agent `setup` | parent id is available in create options | **Runtime-proven admission path** |
| Session | resume | Create | Restore | Agent `setup` | `resumeSessionId` available; durable owner is authoritative | **Runtime-proven admission path** |
| Session | mux frames | Stream | Filter | `events.mux` | all-session aggregated; session-bearing frames are keyed | **Pending ②-C** |
| Approval/Question | `respond` | Response | Guard after correlation | `/api/respond` | incoming `ClientResponse` has `rpcId`, not `sessionId`; outgoing request/pending registry identifies the session | **Pending ②-C correlation proof** (H4) |
| Workspace | host frames / workspace methods | Host/global resource | Deny in v0 | facade / host stream | no tenant resource model yet | **DENY until H2** |
| Deployment management | settings / credentials / preset authoring / host-scoped LLM config | Host-global privileged surface | Deny in v0 | real `ApiProxy` facade | modifies or reveals deployment-level configuration/capabilities | **DENY** |

## 3. Unary RPC surface (`RpcMethodMap` — closed typed union)

The `/api` unary surface is a **generated, closed map**. `dsh-multi-tenant-web`
now imports the real `RpcMethodMap` and defines:

```ts
Record<keyof RpcMethodMap, Category>
```

so a new DSH method or a misspelled classification key fails `tsc` instead of
silently falling through. The runtime backstop still treats unknown string
methods as `deny`.

Namespaces / methods (52 total):

| Namespace | Methods | Tenant-security treatment |
|---|---|---|
| `session.*` | `list` `search` `create` `history` `models` `selectModel` `rename` `fork` `prompt` `attachment` `updateQueue` `cancel` | list=FILTER; search=DENY pending scoped query; create=ADMIT; remaining session-keyed methods=GUARD |
| `subagent.*` | `list` `history` `prompt` `interrupt` | GUARD on `parentSessionId` |
| `host.*` | `describe` `pickDirectory` `listDirectory` `createDirectory` `openPath` | DENY (host-global) |
| `workspace.*` | `list` `create` `rename` `delete` `insertBefore` `insertSessionBefore` `archiveSession` | DENY until H2 |
| `goal.*` | `create` `edit` `pause` `resume` `complete` `clear` | GUARD on `sessionId` |
| `skill.*` | `list` | GUARD on `sessionId` |
| `agentPreset.*` | `list` `select` `read` `copy` `openDocument` `remove` | list=ALLOW picker discovery; select=GUARD; authoring/inspection=DENY |
| `settings.*` | `describe` `openDocument` `update` `replace` `mutate` | DENY (deployment configuration) |
| `credentials.*` | `describe` `set` `unset` | DENY (deployment credentials) |
| `llm.*` | `providers` `models` `discoverModels` | DENY for v0 (host-scoped configuration/catalog); guarded `session.models` remains available |

The important distinction is now explicit: **no session id** does not imply
**ALLOW**. Host/global privilege surfaces are denied until they have an explicit
resource/role model.

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
  | { type: 'stream/error'; error }
```

Session-bearing frames can be filtered by ownership once a principal is bound to
the connection. Unclassifiable/control/error frames need an explicit redact or
terminate policy; they must not be blindly attributed to a tenant.

### 4.2 `events.host` — `HostFrame` (mixed resource)

`events.host` mixes Session, Workspace, and host-global frames. v0 therefore
allows only explicitly session-keyed frames that pass ownership and denies the
rest until H2 defines Workspace/host resource ownership.

## 5. `/api/respond` (bidirectional)

Approval/question is server-initiated: the host emits a `ServerRequest` carrying
its `rpcId` and session-bearing payload; the browser replies with a
`ClientResponse` over `POST /api/respond`. The **incoming response itself does
not carry `sessionId`** — it carries only `rpcId` and `result`.

Therefore the tenant guard must keep or query a pending correlation:

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

This is currently fail-closed in `bindTenant` and remains M4 ②-C work. No
respond-specific upstream seam is assumed until the real transport proof says
one is necessary.

## 6. Seams and gaps

| Gap | Evidence | Status |
|---|---|---|
| Request/connection has no proven principal binding point | unary handler drops Request; WS/HTTP collapse into shared services | H3 hypothesis — prove in ②-C |
| Mux/host streams are global | shared `ApiProxy` / aggregated streams | ②-C |
| `/api/respond` identifies the pending interaction by `rpcId`, not `sessionId` | real `ClientResponse` shape | H4 correlation proof pending ②-C |
| ~~create→claim race~~ | Agent setup runs admission before `sessions.enter` | ~~H1~~ resolved (M4 ②-A) |
| host/workspace/config surfaces have no tenant resource model | host-global contracts | DENY; H2 / privilege model deferred |
| `session.search` is globally capped/ranked | max 20 + `hasMore` | scoped query seam/design pending |

## 7. Ecosystem notes

- **Stale `latest` dist-tags.** Consumers pin explicit prerelease versions rather
  than relying on `latest` while the DSH prerelease tags remain inconsistent.
- **Real `ApiProxy`.** The web package now compiles against the real
  `@deepseek-ai/dsh-host-apiproxy/api` contract; the old spike-local `ApiSurface`
  has been removed.
