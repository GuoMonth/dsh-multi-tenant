/**
 * Context-native multi-tenant runtime primitives for DeepSeek Harness.
 *
 * v0.2 separates two independent planes:
 *
 * - Cordis service isolation owns tenant/principal capability graphs.
 * - DSH scope routing keeps owning agent/preset registration visibility.
 *
 * The v0.1 session-ownership kernel remains shared and is deliberately NOT
 * isolated. It is the persistent fail-closed authorization invariant under the
 * runtime capability boundary.
 *
 * @module dsh-multi-tenant/runtime
 */

import { Service, type Context, type Fiber } from '@deepseek-ai/cordis'
import { ValidationError } from './errors.ts'
import type { TenantPrincipal } from './types.ts'
import { validateTenantId, validateTenantPrincipal } from './validation.ts'

/** Services that must remain shared for Cordis itself or the v0.1 security kernel. */
const RESERVED_SHARED_SERVICES = new Set([
  'events',
  'logger',
  'reflect',
  'registry',
  'tenantRuntime',
  'tenantSessionStore',
  'multiTenant',
])

/** Metadata inherited by every context below one tenant scope. */
const kTenantRuntime = Symbol('dsh-multi-tenant.tenant-runtime')
/** Metadata shadowed on a principal scope below its tenant. */
const kPrincipalRuntime = Symbol('dsh-multi-tenant.principal-runtime')

interface TenantMetadata {
  readonly tenantId: string
}

/** Runtime options for a tenant capability boundary. */
export interface TenantScopeOptions {
  /**
   * Cordis service names that receive independent tenant-local isolation labels.
   * Providers for these names must be mounted below the returned tenant context.
   */
  isolateServices?: readonly string[]
}

/** Runtime options for one authenticated principal below a tenant. */
export interface PrincipalScopeOptions {
  /**
   * Cordis service names that receive independent user/principal-local labels.
   * Use this for user OAuth credentials or other per-principal capabilities.
   */
  isolateServices?: readonly string[]
}

/** One authenticated principal capability scope. */
export interface PrincipalRuntimeScope {
  /** Exact authenticated identity bound to this scope. */
  readonly principal: Readonly<TenantPrincipal>
  /** Context used to mount and resolve principal-local capabilities. */
  readonly ctx: Context
  /** Dispose every plugin/effect owned by this principal scope. */
  dispose(): Promise<void>
}

/** One tenant capability graph. */
export interface TenantRuntimeScope {
  /** Opaque tenant identifier. */
  readonly tenantId: string
  /** Context used to mount and resolve tenant-local capabilities. */
  readonly ctx: Context
  /**
   * Create an authenticated principal scope below this tenant.
   * The principal tenant id must exactly match this scope.
   */
  createPrincipal(principal: TenantPrincipal, options?: PrincipalScopeOptions): PrincipalRuntimeScope
  /** Dispose the tenant scope and every descendant principal/plugin lifecycle. */
  dispose(): Promise<void>
}

/** Shared no-op plugin used only to mint an owned Cordis fiber for a scope. */
function runtimeScopeOwner(): void {}

function normalizeServiceNames(names: readonly string[] | undefined): string[] {
  if (names === undefined) return []
  const unique = new Set<string>()
  for (const name of names) {
    if (typeof name !== 'string' || name.length === 0 || name !== name.trim()) {
      throw new ValidationError('isolated service names must be non-empty trimmed strings')
    }
    if (RESERVED_SHARED_SERVICES.has(name)) {
      throw new ValidationError(`service "${name}" is shared/reserved and cannot be tenant-isolated`)
    }
    unique.add(name)
  }
  return [...unique]
}

function isolatedContext(base: Context, names: readonly string[], scopeKind: 'tenant' | 'principal'): Context {
  let current = base
  for (const name of names) {
    // Symbol identity, not its diagnostic description, is the isolation key.
    // Keep tenant/user identifiers out of framework diagnostics by design.
    current = current.isolate(name, Symbol(`${scopeKind}:${name}`))
  }
  return current
}

/** Await a Cordis fiber's complete quiescent disposal. */
async function disposeFiber(fiber: Fiber): Promise<void> {
  await Promise.resolve(fiber.dispose())
  while (fiber.inertia !== undefined) await fiber.inertia
}

/**
 * Read the tenant selected by the nearest runtime scope.
 *
 * This is contextual identity for trusted same-process plugins. It is not an
 * authorization decision; durable/session boundaries must still use
 * `ctx.multiTenant` ownership checks.
 */
export function tenantIdOf(ctx: Context): string | undefined {
  const metadata = (ctx as Context & { [kTenantRuntime]?: TenantMetadata })[kTenantRuntime]
  return metadata?.tenantId
}

/**
 * Read the authenticated principal selected by the nearest principal scope.
 * Returns undefined in root/tenant-only contexts.
 */
export function principalOf(ctx: Context): Readonly<TenantPrincipal> | undefined {
  return (ctx as Context & { [kPrincipalRuntime]?: Readonly<TenantPrincipal> })[kPrincipalRuntime]
}

/**
 * Runtime manager that mints canonical tenant contexts over one shared DSH
 * process/service graph.
 *
 * The service itself is deployment-global. Each tenant gets a real Cordis
 * child lifecycle plus independent isolation labels for explicitly selected
 * capability services. This avoids a second ad-hoc `tenantId -> service Map`
 * resolver while keeping the v0.1 ownership kernel globally authoritative.
 */
export class TenantRuntimeService extends Service {
  static inject = ['multiTenant']

  private readonly selfCtx: Context
  private readonly tenants = new Map<string, TenantRuntimeScope>()

  constructor(ctx: Context) {
    super(ctx, 'tenantRuntime')
    this.selfCtx = ctx
  }

  /** Return the currently live tenant scope, if one exists. */
  get(tenantId: string): TenantRuntimeScope | undefined {
    validateTenantId(tenantId)
    return this.tenants.get(tenantId)
  }

  /**
   * Create the canonical live scope for one tenant.
   *
   * Duplicate live scopes are rejected: a tenant must have one capability
   * graph per runtime, otherwise two requests could silently resolve different
   * auth/MCP/credential providers for the same tenant identity.
   */
  createTenant(tenantId: string, options: TenantScopeOptions = {}): TenantRuntimeScope {
    validateTenantId(tenantId)
    if (this.tenants.has(tenantId)) {
      throw new MultiTenantRuntimeError(`tenant "${tenantId}" already has a live runtime scope`)
    }

    const services = normalizeServiceNames(options.isolateServices)
    const base = isolatedContext(this.selfCtx, services, 'tenant')
    const fiber = base.plugin(runtimeScopeOwner)
    const metadata: TenantMetadata = Object.freeze({ tenantId })
    const tenantCtx = fiber.ctx.extend({ [kTenantRuntime]: metadata })
    let disposing: Promise<void> | undefined

    const scope: TenantRuntimeScope = {
      tenantId,
      ctx: tenantCtx,
      createPrincipal: (principal, principalOptions = {}) => {
        validateTenantPrincipal(principal)
        if (principal.tenantId !== tenantId) {
          throw new ValidationError('principal tenantId does not match the tenant runtime scope')
        }
        const principalServices = normalizeServiceNames(principalOptions.isolateServices)
        const principalBase = isolatedContext(tenantCtx, principalServices, 'principal')
        const principalFiber = principalBase.plugin(runtimeScopeOwner)
        const boundPrincipal = Object.freeze({ tenantId: principal.tenantId, userId: principal.userId })
        const principalCtx = principalFiber.ctx.extend({ [kPrincipalRuntime]: boundPrincipal })
        let principalDisposing: Promise<void> | undefined
        return {
          principal: boundPrincipal,
          ctx: principalCtx,
          dispose: () => (principalDisposing ??= disposeFiber(principalFiber)),
        }
      },
      dispose: () => {
        if (disposing !== undefined) return disposing
        // Keep the canonical scope registered until teardown reaches quiescence,
        // so callers cannot overlap a replacement graph with one still disposing.
        disposing = disposeFiber(fiber).finally(() => {
          if (this.tenants.get(tenantId) === scope) this.tenants.delete(tenantId)
        })
        return disposing
      },
    }

    this.tenants.set(tenantId, scope)
    return scope
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantRuntime: TenantRuntimeService
  }
}

/** Runtime lifecycle/configuration error distinct from an access denial. */
export class MultiTenantRuntimeError extends Error {
  override name = 'MultiTenantRuntimeError'
}

export default TenantRuntimeService
