/**
 * Context-native multi-tenant runtime primitives for DeepSeek Harness.
 *
 * Tenant, Principal and v0.3 Operation ownership share one structural model:
 * canonical long-lived scopes publish transactionally, while ephemeral
 * Operations are owned and drained by their canonical Principal.
 *
 * @module dsh-multi-tenant/runtime
 */

import { Service, type Context, type Fiber } from '@deepseek-ai/cordis'
import { ValidationError } from './errors.ts'
import type { PrincipalOperationRegistry } from './operation.ts'
import { createPrincipalOperationRegistry } from './operation.ts'
import { disposeFiber, isolatedContext, normalizeServiceNames, raceAbort } from './scope.ts'
import type { TenantPrincipal } from './types.ts'
import { validateTenantId, validateTenantPrincipal } from './validation.ts'

const kTenantRuntime = Symbol('dsh-multi-tenant.tenant-runtime')
const kPrincipalRuntime = Symbol('dsh-multi-tenant.principal-runtime')

export interface TenantIdentity {
  readonly tenantId: string
}

export interface RuntimeContextIdentity {
  readonly tenant: Readonly<TenantIdentity>
  readonly principal?: Readonly<TenantPrincipal>
}

export type RuntimeScopeState = 'active' | 'disposing' | 'disposed'

export interface RuntimeScopeSetupCommit {
  commit(): void
}

export interface RuntimeScopePreparation<I> {
  readonly ctx: Context
  readonly identity: Readonly<I>
  readonly signal: AbortSignal
}

export type RuntimeScopeSetup<I> = (
  preparation: RuntimeScopePreparation<I>,
) => RuntimeScopeSetupCommit | PromiseLike<RuntimeScopeSetupCommit | void> | void

export interface RuntimeScopeDefinition<I> {
  readonly isolateServices?: readonly string[]
  /**
   * Optional semantic identity of the creation recipe.
   *
   * Canonical consumers that only join by identity omit this field. Framework
   * layers that know the recipe (for example a compiled SaaS plan) provide a
   * deterministic key so an already-published node cannot silently accept a
   * structurally different definition that happens to isolate the same names.
   */
  readonly definitionKey?: string
  readonly setup?: RuntimeScopeSetup<I>
}

export type TenantScopeDefinition = RuntimeScopeDefinition<TenantIdentity>
export type PrincipalScopeDefinition = RuntimeScopeDefinition<TenantPrincipal>

export interface RuntimeScope<K extends 'tenant' | 'principal', I> {
  readonly kind: K
  readonly identity: Readonly<I>
  readonly ctx: Context
  readonly state: RuntimeScopeState
  dispose(): Promise<void>
}

export interface RuntimeScopeRegistry<Key, Scope, Definition> {
  get(key: Key): Scope | undefined
  /**
   * Join the canonical active node, or create it when absent.
   *
   * Omitting `definition` means the caller only depends on identity and does
   * not need to know the creation recipe of an already-live node. Supplying a
   * definition opts into structural-drift validation.
   */
  ensure(key: Key, definition?: Definition): Promise<Scope>
}

export interface PrincipalRuntimeScope extends RuntimeScope<'principal', TenantPrincipal> {
  /** Ephemeral one-shot work structurally owned and drained by this Principal. */
  readonly operations: PrincipalOperationRegistry
}

export interface TenantRuntimeScope extends RuntimeScope<'tenant', TenantIdentity> {
  readonly principals: RuntimeScopeRegistry<string, PrincipalRuntimeScope, PrincipalScopeDefinition>
}

export class MultiTenantRuntimeError extends Error {
  override name = 'MultiTenantRuntimeError'
}

export class RuntimeDefinitionConflictError extends MultiTenantRuntimeError {
  override name = 'RuntimeDefinitionConflictError'
}

export class RuntimeRegistryClosedError extends MultiTenantRuntimeError {
  override name = 'RuntimeRegistryClosedError'
}

function runtimeScopeOwner(): void {}

interface NormalizedDefinition<I> {
  readonly services: readonly string[]
  readonly signature: string
  readonly setup: RuntimeScopeSetup<I> | undefined
}

function normalizeDefinition<I>(definition: RuntimeScopeDefinition<I> = {}): NormalizedDefinition<I> {
  const services = normalizeServiceNames(definition.isolateServices)
  const definitionKey = definition.definitionKey
  if (definitionKey !== undefined && (
    typeof definitionKey !== 'string'
    || definitionKey.length === 0
    || definitionKey !== definitionKey.trim()
  )) {
    throw new ValidationError('runtime definitionKey must be a non-empty trimmed string')
  }
  return {
    services,
    signature: JSON.stringify({ services, definitionKey: definitionKey ?? null }),
    setup: definition.setup,
  }
}

interface PreparedScope<I> {
  readonly ctx: Context
  readonly fiber: Fiber
  readonly identity: Readonly<I>
}

interface ScopeCreation<Scope> {
  readonly ready: Promise<Scope>
  cancel(reason: Error): Promise<void>
}

/**
 * Start an unpublished, cancellable canonical-scope transaction.
 *
 * Setup and its optional synchronous commit complete before the scope can be
 * published through the canonical registry. Cancellation disposes the whole
 * unpublished Cordis subtree.
 */
function prepareScope<I>(
  parent: Context,
  kind: 'tenant' | 'principal',
  identity: Readonly<I>,
  definition: NormalizedDefinition<I>,
  metadata: Record<PropertyKey, unknown>,
): ScopeCreation<PreparedScope<I>> {
  const base = isolatedContext(parent, definition.services, kind)
  const fiber = base.plugin(runtimeScopeOwner)
  const ctx = fiber.ctx.extend(metadata)
  const abort = new AbortController()
  let disposal: Promise<void> | undefined

  const cancel = (reason: Error): Promise<void> => {
    if (!abort.signal.aborted) abort.abort(reason)
    return (disposal ??= disposeFiber(fiber))
  }

  ctx.effect(() => () => {
    if (!abort.signal.aborted) {
      abort.abort(new MultiTenantRuntimeError(`${kind} runtime setup owner disposed`))
    }
  }, `tenantRuntime.${kind}.setupAbort()`)

  const ready = (async (): Promise<PreparedScope<I>> => {
    try {
      const result = definition.setup === undefined
        ? undefined
        : await raceAbort(definition.setup({ ctx, identity, signal: abort.signal }), abort.signal)

      fiber.assertActive()
      if (result !== undefined) {
        if (typeof result !== 'object' || result === null || typeof result.commit !== 'function') {
          throw new TypeError('runtime scope setup must return void or { commit(): void }')
        }
        result.commit()
      }
      fiber.assertActive()
      return { ctx, fiber, identity }
    } catch (error) {
      await cancel(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  })()

  return { ready, cancel }
}

interface CanonicalEntry<Scope> {
  readonly signature: string
  readonly creation: ScopeCreation<Scope>
  scope: Scope | undefined
}

type PublishedScope = RuntimeScope<'tenant' | 'principal', unknown>

/**
 * Canonical registry shared by Tenant and Principal nodes.
 *
 * Registry shutdown first closes admission, then cancels unpublished creation
 * and drains every published scope before forgetting canonical identities.
 */
class CanonicalRuntimeRegistry<
  Key,
  Scope extends PublishedScope,
  Identity,
  Definition extends RuntimeScopeDefinition<Identity>,
> implements RuntimeScopeRegistry<Key, Scope, Definition> {
  private readonly entries = new Map<Key, CanonicalEntry<Scope>>()
  private accepting = true
  private closing: Promise<void> | undefined

  constructor(
    private readonly normalize: (definition: Definition | undefined) => NormalizedDefinition<Identity>,
    private readonly create: (
      key: Key,
      definition: NormalizedDefinition<Identity>,
      retire: (scope: Scope) => void,
    ) => ScopeCreation<Scope>,
  ) {}

  get(key: Key): Scope | undefined {
    if (!this.accepting) return undefined
    const scope = this.entries.get(key)?.scope
    return scope?.state === 'active' ? scope : undefined
  }

  async ensure(key: Key, definition?: Definition): Promise<Scope> {
    if (!this.accepting) throw new RuntimeRegistryClosedError('runtime scope registry is closing')

    const definitionSupplied = definition !== undefined
    const normalized = this.normalize(definition)
    const existing = this.entries.get(key)
    if (existing !== undefined) {
      if (definitionSupplied && existing.signature !== normalized.signature) {
        throw new RuntimeDefinitionConflictError(
          'canonical runtime scope already exists with a different creation definition',
        )
      }
      const scope = await existing.creation.ready
      if (!this.accepting) throw new RuntimeRegistryClosedError('runtime scope registry is closing')
      if (scope.state !== 'active') {
        await scope.dispose()
        return this.ensure(key, definition)
      }
      return scope
    }

    let entry!: CanonicalEntry<Scope>
    const retire = (scope: Scope): void => {
      if (this.entries.get(key) === entry && entry.scope === scope) this.entries.delete(key)
    }
    const rawCreation = this.create(key, normalized, retire)
    const creation: ScopeCreation<Scope> = {
      cancel: reason => rawCreation.cancel(reason),
      ready: rawCreation.ready.then(
        (scope) => {
          if (this.entries.get(key) === entry) entry.scope = scope
          return scope
        },
        (error) => {
          if (this.entries.get(key) === entry) this.entries.delete(key)
          throw error
        },
      ),
    }
    entry = { signature: normalized.signature, creation, scope: undefined }
    this.entries.set(key, entry)

    const scope = await creation.ready
    if (!this.accepting) {
      await scope.dispose()
      throw new RuntimeRegistryClosedError('runtime scope registry is closing')
    }
    return scope
  }

  disposeAll(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.accepting = false
    const reason = new RuntimeRegistryClosedError('runtime scope registry is closing')
    const entries = [...this.entries.values()]

    this.closing = (async () => {
      await Promise.all(entries.map(async (entry) => {
        try {
          await entry.creation.cancel(reason)
        } catch {
          // Continue draining siblings even if one cleanup fails.
        }
        try {
          const scope = await entry.creation.ready
          if (scope.state !== 'disposed') await scope.dispose()
        } catch {
          // A cancelled/failed unpublished creation has no published scope.
        }
      }))
      this.entries.clear()
    })()
    return this.closing
  }
}

function createScopeLifecycle(
  fiber: Fiber,
  beforeDispose: () => Promise<void>,
  onDisposed: () => void,
): { readonly state: RuntimeScopeState; dispose(): Promise<void> } {
  let state: RuntimeScopeState = 'active'
  let disposing: Promise<void> | undefined

  return {
    get state() {
      return state
    },
    dispose() {
      if (disposing !== undefined) return disposing
      if (state === 'disposed') return Promise.resolve()
      state = 'disposing'
      disposing = (async () => {
        try {
          // Structural child registries become quiescent before Cordis starts
          // recursively unloading the owning canonical scope.
          await beforeDispose()
          await disposeFiber(fiber)
        } finally {
          state = 'disposed'
          onDisposed()
        }
      })()
      return disposing
    },
  }
}

function bindPreparedScope<Scope extends PublishedScope, I>(
  preparation: ScopeCreation<PreparedScope<I>>,
  build: (prepared: PreparedScope<I>) => Scope,
): ScopeCreation<Scope> {
  let scope: Scope | undefined
  let cancellation: Promise<void> | undefined

  const ready = preparation.ready.then((prepared) => {
    prepared.fiber.assertActive()
    scope = build(prepared)
    return scope
  })

  return {
    ready,
    cancel(reason: Error): Promise<void> {
      if (cancellation !== undefined) return cancellation
      cancellation = (async () => {
        if (scope !== undefined) {
          await scope.dispose()
          return
        }
        await preparation.cancel(reason)
        try {
          const published = await ready
          if (published.state !== 'disposed') await published.dispose()
        } catch {
          // Cancellation or setup failure prevented publication.
        }
      })()
      return cancellation
    },
  }
}

export function runtimeIdentityOf(ctx: Context): RuntimeContextIdentity | undefined {
  const tenant = (ctx as Context & { [kTenantRuntime]?: Readonly<TenantIdentity> })[kTenantRuntime]
  if (tenant === undefined) return undefined
  const principal = (ctx as Context & { [kPrincipalRuntime]?: Readonly<TenantPrincipal> })[kPrincipalRuntime]
  return principal === undefined ? { tenant } : { tenant, principal }
}

export function tenantIdOf(ctx: Context): string | undefined {
  return runtimeIdentityOf(ctx)?.tenant.tenantId
}

export function principalOf(ctx: Context): Readonly<TenantPrincipal> | undefined {
  return runtimeIdentityOf(ctx)?.principal
}

export class TenantRuntimeService extends Service {
  static inject = ['multiTenant']

  private readonly selfCtx: Context
  private readonly tenantRegistry: CanonicalRuntimeRegistry<
    string,
    TenantRuntimeScope,
    TenantIdentity,
    TenantScopeDefinition
  >
  readonly tenants: RuntimeScopeRegistry<string, TenantRuntimeScope, TenantScopeDefinition>

  constructor(ctx: Context) {
    super(ctx, 'tenantRuntime')
    this.selfCtx = ctx
    this.tenantRegistry = new CanonicalRuntimeRegistry(
      definition => normalizeDefinition(definition),
      (tenantId, definition, retire) => this.prepareTenant(tenantId, definition, retire),
    )
    this.tenants = this.tenantRegistry
    ctx.effect(() => () => this.tenantRegistry.disposeAll(), 'tenantRuntime.disposeAll()')
  }

  private prepareTenant(
    tenantId: string,
    definition: NormalizedDefinition<TenantIdentity>,
    retire: (scope: TenantRuntimeScope) => void,
  ): ScopeCreation<TenantRuntimeScope> {
    validateTenantId(tenantId)
    const identity = Object.freeze({ tenantId })
    const preparation = prepareScope(
      this.selfCtx,
      'tenant',
      identity,
      definition,
      { [kTenantRuntime]: identity },
    )

    return bindPreparedScope(preparation, (prepared) => {
      const principalRegistry = new CanonicalRuntimeRegistry<
        string,
        PrincipalRuntimeScope,
        TenantPrincipal,
        PrincipalScopeDefinition
      >(
        principalDefinition => normalizeDefinition(principalDefinition),
        (userId, principalDefinition, retirePrincipal) => this.preparePrincipal(
          prepared.ctx,
          identity,
          userId,
          principalDefinition,
          retirePrincipal,
        ),
      )

      let scope!: TenantRuntimeScope
      const lifecycle = createScopeLifecycle(
        prepared.fiber,
        () => principalRegistry.disposeAll(),
        () => retire(scope),
      )
      scope = {
        kind: 'tenant',
        identity,
        ctx: prepared.ctx,
        principals: principalRegistry,
        get state() { return lifecycle.state },
        dispose: () => lifecycle.dispose(),
      }
      return scope
    })
  }

  private preparePrincipal(
    tenantCtx: Context,
    tenant: Readonly<TenantIdentity>,
    userId: string,
    definition: NormalizedDefinition<TenantPrincipal>,
    retire: (scope: PrincipalRuntimeScope) => void,
  ): ScopeCreation<PrincipalRuntimeScope> {
    const principal = Object.freeze({ tenantId: tenant.tenantId, userId })
    validateTenantPrincipal(principal)
    const preparation = prepareScope(
      tenantCtx,
      'principal',
      principal,
      definition,
      { [kPrincipalRuntime]: principal },
    )

    return bindPreparedScope(preparation, (prepared) => {
      const operations = createPrincipalOperationRegistry(prepared.ctx, principal)
      let scope!: PrincipalRuntimeScope
      const lifecycle = createScopeLifecycle(
        prepared.fiber,
        () => operations.disposeAll(),
        () => retire(scope),
      )
      scope = {
        kind: 'principal',
        identity: principal,
        ctx: prepared.ctx,
        operations,
        get state() { return lifecycle.state },
        dispose: () => lifecycle.dispose(),
      }
      return scope
    })
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantRuntime: TenantRuntimeService
  }
}

export default TenantRuntimeService
