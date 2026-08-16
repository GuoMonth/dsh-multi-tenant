/**
 * Exhaustive tenant classification of DSH Web's unary RPC surface.
 *
 * `CLASSIFICATION` is keyed by every member of the real `RpcMethodMap` (the
 * generated, closed method registry in `@deepseek-ai/dsh-host-apiproxy/api`).
 * Because it is annotated `Record<keyof RpcMethodMap, Category>`, the compiler
 * fails when DSH adds a method and this table is not updated — a new API cannot
 * silently pass through as unclassified.
 *
 * Categories:
 *   - `allow`  — no session identity; pass through unchanged (global config:
 *               settings, credentials, llm, agent-preset management, and
 *               `session.create`, whose ownership is established downstream in
 *               the Agent `setup` admission hook).
 *   - `guard`  — a point method whose payload carries a session id; the facade
 *               asserts `assertSessionAccess` before delegating.
 *   - `filter` — a collection method (`session.list` / `session.search`) whose
 *               result is projected to the sessions the principal may access.
 *   - `deny`   — host-global / workspace surfaces that cannot be tenant-isolated
 *               until the resource model (H2) is decided; fail closed.
 *
 * @module dsh-multi-tenant-web/classification
 */
import type { RpcMethodMap } from '@deepseek-ai/dsh-host-apiproxy/api'

export type Category = 'allow' | 'guard' | 'filter' | 'deny'

/**
 * Method name → category. Annotation (not `satisfies`) so both a *missing* key
 * (DSH adds a method) and an *extra* key (a typo) are compile errors.
 */
export const CLASSIFICATION: Record<keyof RpcMethodMap, Category> = {
  // session.*
  'session.list': 'filter',
  'session.search': 'filter',
  'session.create': 'allow',
  'session.history': 'guard',
  'session.models': 'guard',
  'session.selectModel': 'guard',
  'session.rename': 'guard',
  'session.fork': 'guard',
  'session.prompt': 'guard',
  'session.attachment': 'guard',
  'session.updateQueue': 'guard',
  'session.cancel': 'guard',
  // subagent.* — guarded on the parent session (the child is parent-owned).
  'subagent.list': 'guard',
  'subagent.history': 'guard',
  'subagent.prompt': 'guard',
  'subagent.interrupt': 'guard',
  // host.* — host-global, no tenant scope.
  'host.describe': 'deny',
  'host.pickDirectory': 'deny',
  'host.listDirectory': 'deny',
  'host.createDirectory': 'deny',
  'host.openPath': 'deny',
  // workspace.* — resource model (H2) deferred → deny.
  'workspace.list': 'deny',
  'workspace.create': 'deny',
  'workspace.rename': 'deny',
  'workspace.delete': 'deny',
  'workspace.insertBefore': 'deny',
  'workspace.insertSessionBefore': 'deny',
  'workspace.archiveSession': 'deny',
  // skill.* — session-contextual listing.
  'skill.list': 'guard',
  // agentPreset.* — management is global; `select` targets one session.
  'agentPreset.list': 'allow',
  'agentPreset.select': 'guard',
  'agentPreset.read': 'allow',
  'agentPreset.copy': 'allow',
  'agentPreset.openDocument': 'allow',
  'agentPreset.remove': 'allow',
  // goal.* — session-scoped (each goal carries its sessionId).
  'goal.create': 'guard',
  'goal.edit': 'guard',
  'goal.pause': 'guard',
  'goal.resume': 'guard',
  'goal.complete': 'guard',
  'goal.clear': 'guard',
  // settings.* — deployment/global config, not session data.
  'settings.describe': 'allow',
  'settings.openDocument': 'allow',
  'settings.update': 'allow',
  'settings.replace': 'allow',
  'settings.mutate': 'allow',
  // credentials.* — global credential management.
  'credentials.describe': 'allow',
  'credentials.set': 'allow',
  'credentials.unset': 'allow',
  // llm.* — global provider/model catalog.
  'llm.providers': 'allow',
  'llm.models': 'allow',
  'llm.discoverModels': 'allow',
}

/**
 * For `guard` methods, which payload field carries the session id to check.
 * Defaults to `sessionId`; subagent methods key on the parent session.
 */
export const GUARD_SESSION_KEY: Partial<Record<keyof RpcMethodMap, 'sessionId' | 'parentSessionId'>> = {
  'subagent.list': 'parentSessionId',
  'subagent.history': 'parentSessionId',
  'subagent.prompt': 'parentSessionId',
  'subagent.interrupt': 'parentSessionId',
}

/**
 * Classify a method. Unknown methods (e.g. a future DSH method not yet in the
 * table, reached at runtime via a non-typed surface) fail closed as `deny`.
 */
export function classify(method: string): Category {
  return CLASSIFICATION[method as keyof RpcMethodMap] ?? 'deny'
}

/** Session-id field to guard on for a `guard` method. */
export function guardSessionKey(method: string): 'sessionId' | 'parentSessionId' {
  return GUARD_SESSION_KEY[method as keyof RpcMethodMap] ?? 'sessionId'
}
