/**
 * Tenant-bound `ApiProxy` facade.
 *
 * Wraps the **real** `ApiProxy` contract (`@deepseek-ai/dsh-host-apiproxy/api`)
 * and enforces the tenant boundary per method, driven by the exhaustive
 * `CLASSIFICATION` table in `./classification.ts`:
 *
 *   - `allow`  — explicitly tenant-neutral read-only discovery; pass through.
 *   - `guard`  — assert `assertSessionAccess` on the payload's session id before
 *     delegating (throws a uniform `SessionAccessDeniedError` on denial).
 *   - `filter` — project post-filterable collections to visible sessions.
 *   - `admit`  — requires the pre-publication Agent `setup` admission bridge;
 *     denied by the standalone facade until M4 ②-C installs that bridge.
 *   - `deny`   — fail closed (host/global/unmodelled surfaces).
 *
 * The principal is **closed over**, never written to any shared/ambient context,
 * so concurrent tenants cannot cross-talk. The proxy is the runtime dispatcher;
 * the compile-time security invariant lives in `CLASSIFICATION` (a new DSH
 * method fails `tsc`, it cannot silently pass as unclassified).
 *
 * Surfaces *outside* the unary `RpcMethodMap` — `respond` (bidirectional,
 * H4), `events` (streams, ②-C), and `downloads` (host-only) — are denied
 * fail-closed until their enforcement lands.
 *
 * @module dsh-multi-tenant-web/bind-tenant
 */
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import { SessionAccessDeniedError } from 'dsh-multi-tenant'
import type { MultiTenantService, TenantPrincipal } from 'dsh-multi-tenant'
import { classify, guardSessionKey } from './classification.ts'

// Async: ApiProxy methods return promises, so a denial must reject (not throw
// synchronously) to stay uniform with the guard/filter paths.
const deny = async (): Promise<never> => {
  throw new SessionAccessDeniedError()
}

/** A namespace whose every method denies (fail-closed) — for `events` / `downloads`. */
const denySurface = (): unknown => new Proxy({}, { get: () => deny })

/**
 * `ApiProxy` groups methods under plural namespace objects (`sessions`,
 * `subagents`, `skills`, `goals`, `agentPresets`), while the wire method names
 * in `RpcMethodMap` use singular prefixes (`session.*`, `subagent.*`, …). Map
 * the plural namespace field back to the wire prefix before classifying.
 */
const NAMESPACE_PREFIX: Readonly<Record<string, string>> = {
  sessions: 'session',
  subagents: 'subagent',
  skills: 'skill',
  goals: 'goal',
  agentPresets: 'agentPreset',
}

function methodName(namespace: string, method: string): string {
  return `${NAMESPACE_PREFIX[namespace] ?? namespace}.${method}`
}

/** Return `api` narrowed to the sessions `principal` may access. */
export function bindTenant(
  api: ApiProxy,
  principal: TenantPrincipal,
  multiTenant: MultiTenantService,
): ApiProxy {
  const wrap = (name: string, fn: unknown): unknown => {
    if (typeof fn !== 'function') return fn
    switch (classify(name)) {
      case 'allow':
        return fn
      case 'admit':
      case 'deny':
        return deny
      case 'guard':
        return async (request: any, signal: any) => {
          const sessionId: unknown = request?.payload?.[guardSessionKey(name)]
          if (typeof sessionId !== 'string' || sessionId === '') {
            throw new SessionAccessDeniedError()
          }
          await multiTenant.assertSessionAccess(principal, sessionId)
          return (fn as any)(request, signal)
        }
      case 'filter':
        return async (request: any, signal: any) => {
          const response: any = await (fn as any)(request, signal)
          return filterVisible(response, principal, multiTenant)
        }
    }
  }

  return new Proxy(api, {
    get(target, prop, receiver) {
      const key = String(prop)
      // Non-unary surfaces — separate authorization seams, not in RpcMethodMap.
      if (key === 'respond') return deny
      if (key === 'events' || key === 'downloads') return denySurface()
      const namespace = Reflect.get(target, prop, receiver)
      if (namespace !== null && typeof namespace === 'object') {
        return new Proxy(namespace as object, {
          get(nsTarget, method, nsReceiver) {
            const fn = Reflect.get(nsTarget, method, nsReceiver)
            return typeof fn === 'function' ? wrap(methodName(key, String(method)), fn) : fn
          },
        })
      }
      return namespace
    },
  }) as ApiProxy
}

async function filterVisible(
  response: any,
  principal: TenantPrincipal,
  multiTenant: MultiTenantService,
): Promise<any> {
  const items: any[] | undefined = response?.result?.value?.items
  if (items === undefined) return response
  const visible: any[] = []
  for (const item of items) {
    const sessionId: unknown = item?.sessionId
    if (typeof sessionId === 'string' && await multiTenant.canAccessSession(principal, sessionId)) {
      visible.push(item)
    }
  }
  return {
    ...response,
    result: {
      ...response.result,
      value: { ...response.result.value, items: visible },
    },
  }
}
