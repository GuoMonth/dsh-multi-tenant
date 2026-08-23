/**
 * Context-native multi-tenant runtime primitives for DeepSeek Harness.
 *
 * v0.2 models runtime tenancy as a canonical ownership tree:
 *
 *   Root -> Tenant -> Principal -> Agent (owned/composed by DSH)
 *
 * Tenant and Principal nodes share the same lifecycle semantics: prepare an
 * unpublished Cordis context, run setup, optionally commit synchronously, then
 * publish exactly one canonical active node. Failure rolls the unpublished
 * subtree back. DSH's own Agent/Preset scope remains a separate registration
 * plane and is composed from a Principal context rather than being folded into
 * the tenant service-isolation tree.
 *
 * @module dsh-multi-tenant/runtime
 */

import { Service, type Context, type Fiber } from '@deepseek-ai/cordis'
import { ValidationError } from './errors.ts'
import type { TenantPrincipal } from './types.ts'
import { validateTenantId, validateTenantPrincipal } from './validation.ts'

const RESERVED_SHARED_SERVICES = new Set([
  'events',
  'logger',
  'reflect',
  'registry',
  'tenantRuntime',
  'tenantSessionStore',
  'multiTenant',
])

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
   * Omitting `definition` means the caller only cares about identity and does
   * not need to know the creation recipe of an already-live node. Supplying a
   * definition opts into structural-drift validation.
   */
  ensure(key: Key, definition?: Definition): Promise<Scope>
}

export interface PrincipalRuntimeScope extends RuntimeScope<'principal', TenantPrincipal> {}

export interface TenantRuntimeScope extends RuntimeScope<'tenant', TenantIdentity> {
  readonly principals: RuntimeScopeRegistry<string, PrincipalRuntimeScope, PrincipalScopeDefinition>
}

export class MultiTenantRuntimeError extends Error {
  override name = 'MultiTenantRuntimeError'
}

export class RuntimeDefinitionConflictError extends MultiTenantRuntimeError {
  override name = 'RuntimeDefinitionConflictError'
}

function runtimeScopeOwner(): void {}

function normalizeServiceNames(names: readonly string[] | undefined): string[] {
  if (names === undefined) return []
  const unique = new Set<string>()
  for (const name of names) {
    if (typeof name !== 'string' || name.length === 0 || name !== name.trim()) {
      throw new ValidationError('isolated service names must be non-empty trimmed strings')
    }
    if (RESERVED_SHARED_SERVICES.has(name)) {
      throw new ValidationError(`service "${name}" is shared/reserved and cannot be runtime-isolated`)
    }
    unique.add(name)
  }
  return [...unique].sort()
}

/** Public definitions are sparse; normalized internal definitions are total. */
interface NormalizedDefinition<I> {
  readonly services: readonly string[]
  readonly signature: string
  readonly setup: RuntimeScopeSetup<I> | undefined
}

function normalizeDefinition<I>(definition: RuntimeScopeDefinition<I> = {}): NormalizedDefinition<I> {
  const services = normalizeServiceNames(definition.isolateServices)
  return {
    services,
    signature: JSON.stringify(services),
    setup: definition.setup,
  }
}

function isolatedContext(base: Context, names: readonly string[], scopeKind: 'tenant' | 'principal'): Context {
  let current = base
  for (const name of names) {
    current = current.isolate(name, Symbol(`${scopeKind}:${name}`))
  }
  return current
}

async function disposeFiber(fiber: Fiber): Promise<void> {
  await Promise.resolve(fiber.dispose())
  while (fiber.inertia !== undefined) await fiber.inertia
}

async function raceAbort<T>(operation: PromiseLike<T> | T, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('runtime scope setup aborted')
  }
  const aborted = Promise.withResolvers<never>()
  const listener = (): void => {
    aborted.reject(signal.reason instanceof Error ? signal.reason : new Error('runtime scope setup aborted'))
  }
  signal.addEventListener('abort', listener, { once: true })
  try {
    return await Promise.race([Promise.resolve(operation), aborted.promise])
  } finally {
    signal.removeEventListener('abort', listener)
  }
}

interface PreparedScope<I> {
  readonly ctx: Context
  readonly fiber: Fiber
  readonly identity: Readonly<I>
}

async function prepareScope<I>(
  parent: Context,
  kind: 'tenant' | 'principal',
  identity: Readonly<I>,
  definition: NormalizedDefinition<I>,
  metadata: Record<PropertyKey, unknown>,
): Promise<PreparedScope<I>> {
  const base = isolatedContext(parent, definition.services, kind)
  const fiber = base.plugin(runtimeScopeOwner)
  const ctx = fiber.ctx.extend(metadata)
  const abort = new AbortController()

  ctx.effect(() => () => {
    abort.abort(new MultiTenantRuntimeError(`${kind} runtime setup owner disposed`))
  }, `tenantRuntime.${kind}.setupAbort()`)

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
    abort.abort(error)
    await disposeFiber(fiber)
    throw error
  }
}

interface CanonicalEntry<Scope> {
  readonly signature: string
  current: Scope | Promise<Scope>
}

type PublishedScope = RuntimeScope<'tenant' | 'principal', unknown>

class CanonicalRuntimeRegistry<Key, Scope extends PublishedScope, Identity, Definition extends RuntimeScopeDefinition<Identity>>
implements RuntimeScopeRegistry<Key, Scope, Definition> {
  private readonly entries = new Map<Key, CanonicalEntry<Scope>>()

  constructor(
    private readonly normalize: (definition: Definition | undefined) => NormalizedDefinition<Identity>,
    private readonly create: (
      key: Key,
      definition: NormalizedDefinition<Identity>,
      retire: (scope: Scope) => void,
    ) => Promise<Scope>,
  ) {}

  get(key: Key): Scope | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined || entry.current instanceof Promise) return undefined
    return entry.current.state === 'active' ? entry.current : undefined
  }

  async ensure(key: Key, definition?: Definition): Promise<Scope> {
    const definitionSupplied = definition !== undefined
    const normalized = this.normalize(definition)
    const existing = this.entries.get(key)
    if (existing !== undefined) {
      const scope = await existing.current
      if (scope.state !== 'active') {
        await scope.dispose()
        return this.ensure(key, definition)
      }
      if (definitionSupplied && existing.signature !== normalized.signature) {
        throw new RuntimeDefinitionConflictError(
          'canonical runtime scope already exists with a different isolated-service definition',
        )
      }
      return scope
    }

    let creation!: Promise<Scope>
    const retire = (scope: Scope): void => {
      const current = this.entries.get(key)
      if (current?.current === scope) this.entries.delete(key)
    }
    creation = this.create(key, normalized, retire)
    this.entries.set(key, { signature: normalized.signature, current: creation })

    try {
      const scope = await creation
      const entry = this.entries.get(key)
      if (entry?.current === creation) entry.current = scope
      return scope
    } catch (error) {
      const entry = this.entries.get(key)
      if (entry?.current === creation) this.entries.delete(key)
      throw error
    }
  }

  async disposeAll(): Promise<void> {
    const entries = [...this.entries.values()]
    await Promise.all(entries.map(async (entry) => {
      try {
        const scope = await entry.current
        await scope.dispose()
      } catch {
        // Failed unpublished creation already rolled itself back.
      }
    }))
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
      (tenantId, definition, retire) => this.createTenant(tenantId, definition, retire),
    )
    this.tenants = this.tenantRegistry
    ctx.effect(() => () => this.tenantRegistry.disposeAll(), 'tenantRuntime.disposeAll()')
  }

  private async createTenant(
    tenantId: string,
    definition: NormalizedDefinition<TenantIdentity>,
    retire: (scope: TenantRuntimeScope) => void,
  ): Promise<TenantRuntimeScope> {
    validateTenantId(tenantId)
    const identity = Object.freeze({ tenantId })
    const prepared = await prepareScope(
      this.selfCtx,
      'tenant',
      identity,
      definition,
      { [kTenantRuntime]: identity },
    )

    const principalRegistry = new CanonicalRuntimeRegistry<
      string,
      PrincipalRuntimeScope,
      TenantPrincipal,
      PrincipalScopeDefinition
    >(
      principalDefinition => normalizeDefinition(principalDefinition),
      (userId, principalDefinition, retirePrincipal) => this.createPrincipal(
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
  }

  private async createPrincipal(
    tenantCtx: Context,
    tenant: Readonly<TenantIdentity>,
    userId: string,
    definition: NormalizedDefinition<TenantPrincipal>,
    retire: (scope: PrincipalRuntimeScope) => void,
  ): Promise<PrincipalRuntimeScope> {
    const principal = Object.freeze({ tenantId: tenant.tenantId, userId })
    validateTenantPrincipal(principal)
    const prepared = await prepareScope(
      tenantCtx,
      'principal',
      principal,
      definition,
      { [kPrincipalRuntime]: principal },
    )

    let scope!: PrincipalRuntimeScope
    const lifecycle = createScopeLifecycle(prepared.fiber, async () => {}, () => retire(scope))
    scope = {
      kind: 'principal',
      identity: principal,
      ctx: prepared.ctx,
      get state() { return lifecycle.state },
      dispose: () => lifecycle.dispose(),
    }
    return scope
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantRuntime: TenantRuntimeService
  }
}

export default TenantRuntimeService
