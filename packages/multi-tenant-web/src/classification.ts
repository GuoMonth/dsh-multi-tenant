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
 *   - `allow`  — explicitly tenant-neutral read-only discovery that is safe to
 *               expose unchanged.
 *   - `guard`  — a point method whose payload carries a session id; the facade
 *               asserts `assertSessionAccess` before delegating.
 *   - `filter` — a collection that is semantically safe to post-filter by
 *               session ownership (`session.list` today).
 *   - `admit`  — creates a new tenant-owned resource and therefore requires the
 *               pre-publication Agent `setup` admission path. The standalone
 *               ApiProxy facade denies it until that bridge is installed.
 *   - `deny`   — host/global or otherwise unmodelled surfaces; fail closed.
 *
 * @module dsh-multi-tenant-web/classification
 */
import type { RpcMethodMap } from '@deepseek-ai/dsh-host-apiproxy/api'

export type Category = 'allow' | 'guard' | 'filter' | 'admit' | 'deny'

/**
 * Method name → category. Annotation (not `satisfies`) so both a *missing* key
 * (DSH adds a method) and an *extra* key (a typo) are compile errors.
 */
export const CLASSIFICATION: Record<keyof RpcMethodMap, Category> = {
  // session.*
  'session.list': 'filter',
  // Search is capped/ranked globally (20 results + hasMore). Post-filtering can
  // hide a tenant's lower-ranked matches, so it is not a correct tenant-scoped
  // query until DSH exposes a visibility predicate / scoped candidate set.
  'session.search': 'deny',
  // Creation is not ordinary ALLOW: ownership must be established in Agent
  // setup before publication. The transport/admission bridge lands in M4 ②-C.
  'session.create': 'admit',
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
  // agentPreset.list is picker discovery; select targets one guarded session.
  // Authoring/inspection calls are deployment-management surfaces → deny.
  'agentPreset.list': 'allow',
  'agentPreset.select': 'guard',
  'agentPreset.read': 'deny',
  'agentPreset.copy': 'deny',
  'agentPreset.openDocument': 'deny',
  'agentPreset.remove': 'deny',
  // goal.* — session-scoped (each goal carries its sessionId).
  'goal.create': 'guard',
  'goal.edit': 'guard',
  'goal.pause': 'guard',
  'goal.resume': 'guard',
  'goal.complete': 'guard',
  'goal.clear': 'guard',
  // settings.* — deployment/global configuration. DSH documents these as
  // loopback/configuration-plane surfaces, including write-only secrets.
  'settings.describe': 'deny',
  'settings.openDocument': 'deny',
  'settings.update': 'deny',
  'settings.replace': 'deny',
  'settings.mutate': 'deny',
  // credentials.* — deployment credential management, never tenant-session data.
  'credentials.describe': 'deny',
  'credentials.set': 'deny',
  'credentials.unset': 'deny',
  // llm.* — host-scoped provider/configuration catalog. Session-scoped model
  // discovery remains available through guarded `session.models`.
  'llm.providers': 'deny',
  'llm.models': 'deny',
  'llm.discoverModels': 'deny',
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
