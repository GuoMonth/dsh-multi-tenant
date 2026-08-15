/**
 * Spike-local tenant-bound ApiProxy facade.
 *
 * The facade is a pure, closure-bound wrapper: it takes a session-bearing API
 * surface plus a `TenantPrincipal`, and returns a version whose point methods
 * are guarded, collections filtered, and streams filtered. The principal never
 * enters any shared/ambient context — it is closed over, so concurrent tenants
 * cannot cross-talk.
 *
 * The `ApiSurface` here is a spike-local SIMPLIFICATION of the real
 * `@deepseek-ai/dsh-host-apiproxy` `ApiProxy` (whose methods wrap args in
 * `RpcRequest`/`RpcResponse`). The enforcement LOGIC — guard point, filter
 * collection, filter stream, guard response, deny-unclassified — is identical;
 * type-compatibility with the real `ApiProxy` is deferred until DSH publishes a
 * current release or exposes a proper seam (see SEAM-MAP.md / ADR).
 *
 * @module dsh-multi-tenant-web/bind-tenant
 */

import type { MultiTenantService, TenantPrincipal } from 'dsh-multi-tenant'

export interface SessionSummary {
  sessionId: string
}

export interface MuxFrame {
  type: string
  sessionId?: string
}

export interface SessionsSurface {
  list(): Promise<{ items: SessionSummary[] }>
  history(req: { sessionId: string }): Promise<unknown>
}

export interface EventsSurface {
  mux(): AsyncIterable<MuxFrame>
}

export interface ApiSurface {
  sessions: SessionsSurface
  events: EventsSurface
  respond(msg: { sessionId: string }): Promise<unknown>
}

/**
 * Return `api` narrowed to the sessions `principal` may access.
 *
 * - point methods → `assertSessionAccess` guard (throws on denial)
 * - collections → filtered to accessible sessions
 * - streams → frames filtered by their `sessionId`; frames without a
 *   `sessionId` are dropped (fail-closed: cannot be attributed to a tenant)
 * - response (`respond`) → `assertSessionAccess` guard
 */
export function bindTenant(
  api: ApiSurface,
  principal: TenantPrincipal,
  multiTenant: MultiTenantService,
): ApiSurface {
  return {
    sessions: {
      list: async () => {
        const { items } = await api.sessions.list()
        const visible: SessionSummary[] = []
        for (const item of items) {
          if (await multiTenant.canAccessSession(principal, item.sessionId)) {
            visible.push(item)
          }
        }
        return { items: visible }
      },
      history: async (req) => {
        await multiTenant.assertSessionAccess(principal, req.sessionId)
        return api.sessions.history(req)
      },
    },
    events: {
      mux: async function* () {
        for await (const frame of api.events.mux()) {
          // Fail-closed: an unclassifiable frame (no sessionId) is not yielded.
          if (frame.sessionId === undefined) continue
          if (await multiTenant.canAccessSession(principal, frame.sessionId)) {
            yield frame
          }
        }
      },
    },
    respond: async (msg) => {
      await multiTenant.assertSessionAccess(principal, msg.sessionId)
      return api.respond(msg)
    },
  }
}
