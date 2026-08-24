import type { Context } from '@deepseek-ai/cordis'
import type { CapabilityToken } from './capability.ts'
import {
  bootstrapDeploymentComposition,
  operationDefinitionFromPlan,
  principalDefinitionFromPlan,
  tenantDefinitionFromPlan,
  type CompositionPlan,
  type CompositionScopeFingerprints,
  type DeploymentComposition,
} from './composition.ts'
import type {
  PrincipalOperation,
  PrincipalOperationExecution,
} from './operation.ts'
import type {
  PrincipalRuntimeScope,
  TenantIdentity,
  TenantRuntimeScope,
} from './runtime.ts'
import type { TenantPrincipal } from './types.ts'
import { validateTenantId, validateTenantPrincipal, validateUserId } from './validation.ts'

export interface RuntimeCompositionAttestation {
  readonly planFingerprint: string
  readonly scopeFingerprints: CompositionScopeFingerprints
}

export interface RuntimeCompositionOperationDefinition<T> {
  readonly requires?: readonly CapabilityToken[]
  execute(execution: PrincipalOperationExecution): T | PromiseLike<T>
}

export interface ComposedOperationRegistry {
  start<T>(definition: RuntimeCompositionOperationDefinition<T>): PrincipalOperation<T>
}

export interface ComposedPrincipal {
  readonly identity: Readonly<TenantPrincipal>
  readonly ctx: Context
  readonly runtime: PrincipalRuntimeScope
  readonly attestation: RuntimeCompositionAttestation
  readonly operations: ComposedOperationRegistry
}

export interface ComposedPrincipalRegistry {
  get(userId: string): ComposedPrincipal | undefined
  ensure(userId: string): Promise<ComposedPrincipal>
}

export interface ComposedTenant {
  readonly identity: Readonly<TenantIdentity>
  readonly ctx: Context
  readonly runtime: TenantRuntimeScope
  readonly attestation: RuntimeCompositionAttestation
  readonly principals: ComposedPrincipalRegistry
}

export interface ComposedTenantRegistry {
  get(tenantId: string): ComposedTenant | undefined
  ensure(tenantId: string): Promise<ComposedTenant>
}

export interface RuntimeComposition {
  readonly plan: CompositionPlan
  readonly deploymentCtx: Context
  readonly attestation: RuntimeCompositionAttestation
  readonly accepting: boolean
  readonly tenants: ComposedTenantRegistry
  principal(principal: TenantPrincipal): Promise<ComposedPrincipal>
  dispose(): Promise<void>
}

export class RuntimeCompositionError extends Error {
  override name = 'RuntimeCompositionError'
}

export class RuntimeCompositionConflictError extends RuntimeCompositionError {
  override name = 'RuntimeCompositionConflictError'
}

export class RuntimeCompositionClosedError extends RuntimeCompositionError {
  override name = 'RuntimeCompositionClosedError'
}

export class RuntimeCompositionCapabilityError extends RuntimeCompositionError {
  override name = 'RuntimeCompositionCapabilityError'
}

interface ActiveRuntimeComposition {
  readonly planFingerprint: string
  readonly ready: Promise<RuntimeCompositionImpl>
}

const activeCompositions = new WeakMap<Context, ActiveRuntimeComposition>()

function makeAttestation(plan: CompositionPlan): RuntimeCompositionAttestation {
  return Object.freeze({
    planFingerprint: plan.fingerprint,
    scopeFingerprints: Object.freeze({ ...plan.scopeFingerprints }),
  })
}

class ComposedPrincipalImpl implements ComposedPrincipal {
  readonly identity: Readonly<TenantPrincipal>
  readonly ctx: Context
  readonly attestation: RuntimeCompositionAttestation
  readonly operations: ComposedOperationRegistry

  constructor(
    composition: RuntimeCompositionImpl,
    readonly runtime: PrincipalRuntimeScope,
  ) {
    this.identity = runtime.identity
    this.ctx = runtime.ctx
    this.attestation = composition.attestation
    this.operations = Object.freeze({
      start: <T>(definition: RuntimeCompositionOperationDefinition<T>): PrincipalOperation<T> => {
        composition.assertAccepting()
        if (runtime.state !== 'active') throw new RuntimeCompositionClosedError('composed Principal is not active')
        if (typeof definition?.execute !== 'function') throw new TypeError('operation execute must be a function')
        composition.assertOperationCapabilities(definition.requires)
        const scope = operationDefinitionFromPlan(composition.plan)
        const requires = definition.requires
        return runtime.operations.start({
          ...scope,
          ...(requires === undefined ? {} : { requires }),
          execute: definition.execute,
        })
      },
    })
  }
}

class ComposedTenantImpl implements ComposedTenant {
  readonly identity: Readonly<TenantIdentity>
  readonly ctx: Context
  readonly attestation: RuntimeCompositionAttestation
  readonly principals: ComposedPrincipalRegistry
  private readonly principalWrappers = new Map<string, ComposedPrincipalImpl>()

  constructor(
    private readonly composition: RuntimeCompositionImpl,
    readonly runtime: TenantRuntimeScope,
  ) {
    this.identity = runtime.identity
    this.ctx = runtime.ctx
    this.attestation = composition.attestation
    this.principals = Object.freeze({
      get: (userId: string): ComposedPrincipal | undefined => {
        validateUserId(userId)
        composition.assertAccepting()
        const principal = runtime.principals.get(userId)
        return principal === undefined ? undefined : this.wrapPrincipal(principal)
      },
      ensure: async (userId: string): Promise<ComposedPrincipal> => {
        validateUserId(userId)
        composition.assertAccepting()
        if (runtime.state !== 'active') throw new RuntimeCompositionClosedError('composed Tenant is not active')
        const principal = await runtime.principals.ensure(
          userId,
          principalDefinitionFromPlan(composition.plan),
        )
        composition.assertAccepting()
        return this.wrapPrincipal(principal)
      },
    })
  }

  private wrapPrincipal(runtime: PrincipalRuntimeScope): ComposedPrincipalImpl {
    const existing = this.principalWrappers.get(runtime.identity.userId)
    if (existing !== undefined && existing.runtime === runtime) return existing
    const wrapped = new ComposedPrincipalImpl(this.composition, runtime)
    this.principalWrappers.set(runtime.identity.userId, wrapped)
    return wrapped
  }
}

class RuntimeCompositionImpl implements RuntimeComposition {
  readonly attestation: RuntimeCompositionAttestation
  readonly tenants: ComposedTenantRegistry
  private readonly tenantWrappers = new Map<string, ComposedTenantImpl>()
  private readonly ownedTenants = new Set<TenantRuntimeScope>()
  private open = true
  private disposal: Promise<void> | undefined
  private readonly declaredCapabilities: ReadonlyMap<string, CapabilityToken>

  constructor(
    root: Context,
    readonly plan: CompositionPlan,
    private readonly deployment: DeploymentComposition,
    private readonly releaseActive: () => void,
  ) {
    this.attestation = makeAttestation(plan)
    this.declaredCapabilities = new Map(
      plan.capabilities.map(item => [item.capability.key, item.capability] as const),
    )
    this.tenants = Object.freeze({
      get: (tenantId: string): ComposedTenant | undefined => {
        validateTenantId(tenantId)
        this.assertAccepting()
        const tenant = root.tenantRuntime.tenants.get(tenantId)
        return tenant === undefined ? undefined : this.wrapTenant(tenant)
      },
      ensure: async (tenantId: string): Promise<ComposedTenant> => {
        validateTenantId(tenantId)
        this.assertAccepting()
        const tenant = await root.tenantRuntime.tenants.ensure(
          tenantId,
          tenantDefinitionFromPlan(plan),
        )
        this.assertAccepting()
        return this.wrapTenant(tenant)
      },
    })
  }

  get deploymentCtx(): Context {
    return this.deployment.ctx
  }

  get accepting(): boolean {
    return this.open
  }

  assertAccepting(): void {
    if (!this.open) throw new RuntimeCompositionClosedError('runtime composition is closing')
  }

  assertOperationCapabilities(capabilities: readonly CapabilityToken[] | undefined): void {
    if (capabilities === undefined) return
    for (const capability of capabilities) {
      const canonical = this.declaredCapabilities.get(capability.key)
      if (canonical === undefined) {
        throw new RuntimeCompositionCapabilityError(
          `operation capability "${capability.key}" is not declared by the bound CompositionPlan`,
        )
      }
      if (canonical.scope !== capability.scope) {
        throw new RuntimeCompositionCapabilityError(
          `operation capability "${capability.key}" has scope ${capability.scope}, expected ${canonical.scope}`,
        )
      }
    }
  }

  async principal(principal: TenantPrincipal): Promise<ComposedPrincipal> {
    validateTenantPrincipal(principal)
    const tenant = await this.tenants.ensure(principal.tenantId)
    return tenant.principals.ensure(principal.userId)
  }

  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.open = false
    this.disposal = (async () => {
      const failures: unknown[] = []
      const results = await Promise.allSettled([...this.ownedTenants].map(tenant => tenant.dispose()))
      for (const result of results) {
        if (result.status === 'rejected') failures.push(result.reason)
      }
      try {
        await this.deployment.dispose()
      } catch (error) {
        failures.push(error)
      } finally {
        this.tenantWrappers.clear()
        this.ownedTenants.clear()
        this.releaseActive()
      }
      if (failures.length > 0) throw new AggregateError(failures, 'runtime composition teardown failed')
    })()
    return this.disposal
  }

  private wrapTenant(runtime: TenantRuntimeScope): ComposedTenantImpl {
    this.ownedTenants.add(runtime)
    const existing = this.tenantWrappers.get(runtime.identity.tenantId)
    if (existing !== undefined && existing.runtime === runtime) return existing
    const wrapped = new ComposedTenantImpl(this, runtime)
    this.tenantWrappers.set(runtime.identity.tenantId, wrapped)
    return wrapped
  }
}

/**
 * Materialize one exact CompositionPlan as the product-facing Runtime view for
 * a root Context. Calls using the same plan single-flight/join; a different
 * whole-plan identity fails instead of silently mixing deployment, Tenant,
 * Principal or Operation recipes.
 */
export async function materializeRuntimeComposition(
  ctx: Context,
  plan: CompositionPlan,
): Promise<RuntimeComposition> {
  const existing = activeCompositions.get(ctx)
  if (existing !== undefined) {
    if (existing.planFingerprint !== plan.fingerprint) {
      throw new RuntimeCompositionConflictError(
        'root Context already has an active RuntimeComposition for a different CompositionPlan',
      )
    }
    return existing.ready
  }

  let entry!: ActiveRuntimeComposition
  const ready = (async (): Promise<RuntimeCompositionImpl> => {
    const deployment = await bootstrapDeploymentComposition(ctx, plan)
    return new RuntimeCompositionImpl(ctx, plan, deployment, () => {
      if (activeCompositions.get(ctx) === entry) activeCompositions.delete(ctx)
    })
  })()
  entry = { planFingerprint: plan.fingerprint, ready }
  activeCompositions.set(ctx, entry)

  try {
    return await ready
  } catch (error) {
    if (activeCompositions.get(ctx) === entry) activeCompositions.delete(ctx)
    throw error
  }
}
