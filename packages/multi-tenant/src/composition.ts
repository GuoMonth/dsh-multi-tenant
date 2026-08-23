import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { OperationScopeDefinition, OperationScopePreparation } from './operation.ts'
import type {
  PrincipalScopeDefinition,
  RuntimeScopePreparation,
  TenantIdentity,
  TenantScopeDefinition,
} from './runtime.ts'
import type { TenantPrincipal } from './types.ts'
import { disposeFiber, normalizeServiceNames, raceAbort } from './scope.ts'

export type CapabilityScope = 'deployment' | 'tenant' | 'principal' | 'operation'

export interface CapabilityDefinition {
  readonly key: string
  readonly scope: CapabilityScope
  readonly required?: boolean
  readonly defaultProvider?: string
}

export interface CapabilityProviderSetupCommit {
  commit(): void
}

export interface CapabilityProviderPreparation {
  readonly ctx: Context
  readonly scope: CapabilityScope
  readonly signal: AbortSignal
}

export type CapabilityProviderSetup = (
  preparation: CapabilityProviderPreparation,
) => CapabilityProviderSetupCommit | PromiseLike<CapabilityProviderSetupCommit | void> | void

export interface CapabilityProviderDefinition {
  readonly id: string
  readonly capability: string
  readonly scope: CapabilityScope
  readonly requires?: readonly string[]
  /**
   * Mount the provider in the native Cordis scope. Omitting setup declares an
   * ambient provider whose service must already be visible at materialization.
   */
  readonly setup?: CapabilityProviderSetup
}

export interface SaaSDefinition {
  readonly capabilities: readonly CapabilityDefinition[]
  readonly providers?: readonly CapabilityProviderDefinition[]
  readonly select?: Readonly<Record<string, string>>
}

export interface PlannedCapability {
  readonly key: string
  readonly scope: CapabilityScope
  readonly required: boolean
  readonly providerId?: string
}

export interface PlannedProvider {
  readonly id: string
  readonly capability: string
  readonly scope: CapabilityScope
  readonly requires: readonly string[]
  readonly setup?: CapabilityProviderSetup
}

export interface CompositionPlan {
  readonly capabilities: readonly PlannedCapability[]
  readonly providers: readonly PlannedProvider[]
  readonly bootstrapOrder: readonly string[]
}

export class CompositionError extends Error {
  override name = 'CompositionError'
}

export class DuplicateCapabilityError extends CompositionError {
  override name = 'DuplicateCapabilityError'
}

export class DuplicateProviderDefinitionError extends CompositionError {
  override name = 'DuplicateProviderDefinitionError'
}

export class UnknownCapabilityError extends CompositionError {
  override name = 'UnknownCapabilityError'
}

export class MissingCapabilityProviderError extends CompositionError {
  override name = 'MissingCapabilityProviderError'
}

export class AmbiguousCapabilityProviderError extends CompositionError {
  override name = 'AmbiguousCapabilityProviderError'
}

export class InvalidProviderSelectionError extends CompositionError {
  override name = 'InvalidProviderSelectionError'
}

export class CapabilityScopeMismatchError extends CompositionError {
  override name = 'CapabilityScopeMismatchError'
}

export class CapabilityDependencyError extends CompositionError {
  override name = 'CapabilityDependencyError'
}

export class CapabilityDependencyVisibilityError extends CompositionError {
  override name = 'CapabilityDependencyVisibilityError'
}

export class CapabilityDependencyCycleError extends CompositionError {
  override name = 'CapabilityDependencyCycleError'
}

export class CapabilityProviderUnavailableError extends CompositionError {
  override name = 'CapabilityProviderUnavailableError'
}

const SCOPE_RANK: Readonly<Record<CapabilityScope, number>> = Object.freeze({
  deployment: 0,
  tenant: 1,
  principal: 2,
  operation: 3,
})

function semanticName(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${label} must be a non-empty trimmed string`)
  }
  return value
}

function normalizeDependencies(names: readonly string[] | undefined): readonly string[] {
  if (names === undefined) return Object.freeze([])
  const unique = new Set<string>()
  for (const name of names) unique.add(semanticName(name, 'capability dependency'))
  return Object.freeze([...unique].sort())
}

function freezeProvider(provider: CapabilityProviderDefinition): PlannedProvider {
  const base = {
    id: semanticName(provider.id, 'provider id'),
    capability: semanticName(provider.capability, 'provider capability'),
    scope: provider.scope,
    requires: normalizeDependencies(provider.requires),
  }
  return Object.freeze(provider.setup === undefined ? base : { ...base, setup: provider.setup })
}

function freezeCapability(
  capability: CapabilityDefinition,
  providerId: string | undefined,
): PlannedCapability {
  const base = {
    key: semanticName(capability.key, 'capability key'),
    scope: capability.scope,
    required: capability.required ?? false,
  }
  return Object.freeze(providerId === undefined ? base : { ...base, providerId })
}

function validateScope(scope: string, label: string): asserts scope is CapabilityScope {
  if (!(scope in SCOPE_RANK)) throw new TypeError(`${label} has unsupported scope "${scope}"`)
}

export function compileSaaSDefinition(definition: SaaSDefinition): CompositionPlan {
  if (definition === null || typeof definition !== 'object') throw new TypeError('SaaSDefinition must be an object')
  if (!Array.isArray(definition.capabilities)) throw new TypeError('SaaSDefinition.capabilities must be an array')

  const capabilityDefs = new Map<string, CapabilityDefinition>()
  for (const raw of definition.capabilities) {
    const key = semanticName(raw.key, 'capability key')
    validateScope(raw.scope, `capability "${key}"`)
    if (capabilityDefs.has(key)) throw new DuplicateCapabilityError(`capability "${key}" is declared more than once`)
    if (raw.defaultProvider !== undefined) semanticName(raw.defaultProvider, `default provider for "${key}"`)
    capabilityDefs.set(key, raw)
  }

  const providerDefs = new Map<string, PlannedProvider>()
  const providersByCapability = new Map<string, PlannedProvider[]>()
  for (const raw of definition.providers ?? []) {
    validateScope(raw.scope, `provider "${raw.id}"`)
    const provider = freezeProvider(raw)
    if (providerDefs.has(provider.id)) {
      throw new DuplicateProviderDefinitionError(`provider "${provider.id}" is declared more than once`)
    }
    const capability = capabilityDefs.get(provider.capability)
    if (capability === undefined) {
      throw new UnknownCapabilityError(`provider "${provider.id}" targets unknown capability "${provider.capability}"`)
    }
    if (capability.scope !== provider.scope) {
      throw new CapabilityScopeMismatchError(
        `provider "${provider.id}" is ${provider.scope}-scoped but capability "${provider.capability}" is ${capability.scope}-scoped`,
      )
    }
    providerDefs.set(provider.id, provider)
    const list = providersByCapability.get(provider.capability) ?? []
    list.push(provider)
    providersByCapability.set(provider.capability, list)
  }

  for (const key of Object.keys(definition.select ?? {})) {
    if (!capabilityDefs.has(key)) throw new UnknownCapabilityError(`selection targets unknown capability "${key}"`)
  }

  const capabilities: PlannedCapability[] = []
  const selectedProviders = new Map<string, PlannedProvider>()

  for (const key of [...capabilityDefs.keys()].sort()) {
    const capability = capabilityDefs.get(key)!
    const candidates = [...(providersByCapability.get(key) ?? [])].sort((a, b) => a.id.localeCompare(b.id))
    const explicit = definition.select?.[key]
    const requested = explicit ?? capability.defaultProvider
    let selected: PlannedProvider | undefined

    if (requested !== undefined) {
      const providerId = semanticName(requested, `selected provider for "${key}"`)
      selected = candidates.find(candidate => candidate.id === providerId)
      if (selected === undefined) {
        throw new InvalidProviderSelectionError(
          `capability "${key}" selects provider "${providerId}" which is not a candidate`,
        )
      }
    } else if (candidates.length === 1) {
      selected = candidates[0]
    } else if (candidates.length > 1) {
      throw new AmbiguousCapabilityProviderError(
        `capability "${key}" has multiple providers (${candidates.map(candidate => candidate.id).join(', ')}) but no selection`,
      )
    }

    if (selected === undefined && (capability.required ?? false)) {
      throw new MissingCapabilityProviderError(`required capability "${key}" has no provider`)
    }
    if (selected !== undefined) selectedProviders.set(key, selected)
    capabilities.push(freezeCapability(capability, selected?.id))
  }

  for (const provider of selectedProviders.values()) {
    for (const dependencyKey of provider.requires) {
      const dependency = capabilityDefs.get(dependencyKey)
      if (dependency === undefined) {
        throw new CapabilityDependencyError(
          `provider "${provider.id}" depends on unknown capability "${dependencyKey}"`,
        )
      }
      const selectedDependency = selectedProviders.get(dependencyKey)
      if (selectedDependency === undefined) {
        throw new CapabilityDependencyError(
          `provider "${provider.id}" depends on unbound capability "${dependencyKey}"`,
        )
      }
      if (SCOPE_RANK[dependency.scope] > SCOPE_RANK[provider.scope]) {
        throw new CapabilityDependencyVisibilityError(
          `${provider.scope}-scoped provider "${provider.id}" cannot depend on descendant ${dependency.scope}-scoped capability "${dependencyKey}"`,
        )
      }
    }
  }

  const providers = [...selectedProviders.values()].sort((a, b) => a.id.localeCompare(b.id))
  const providerById = new Map(providers.map(provider => [provider.id, provider] as const))
  const providerByCapability = new Map(providers.map(provider => [provider.capability, provider] as const))
  const indegree = new Map<string, number>(providers.map(provider => [provider.id, 0]))
  const dependents = new Map<string, string[]>()

  for (const provider of providers) {
    for (const dependencyKey of provider.requires) {
      const dependencyProvider = providerByCapability.get(dependencyKey)!
      indegree.set(provider.id, (indegree.get(provider.id) ?? 0) + 1)
      const list = dependents.get(dependencyProvider.id) ?? []
      list.push(provider.id)
      dependents.set(dependencyProvider.id, list)
    }
  }

  const ready = [...providers]
    .filter(provider => indegree.get(provider.id) === 0)
    .map(provider => provider.id)
    .sort()
  const bootstrapOrder: string[] = []

  while (ready.length > 0) {
    const providerId = ready.shift()!
    bootstrapOrder.push(providerId)
    for (const dependentId of [...(dependents.get(providerId) ?? [])].sort()) {
      const next = (indegree.get(dependentId) ?? 0) - 1
      indegree.set(dependentId, next)
      if (next === 0) {
        ready.push(dependentId)
        ready.sort()
      }
    }
  }

  if (bootstrapOrder.length !== providers.length) {
    const cyclic = providers
      .filter(provider => !bootstrapOrder.includes(provider.id))
      .map(provider => provider.id)
      .sort()
    throw new CapabilityDependencyCycleError(`capability provider dependency cycle: ${cyclic.join(' -> ')}`)
  }

  for (const providerId of bootstrapOrder) {
    if (!providerById.has(providerId)) throw new Error(`internal composition error: unknown provider "${providerId}"`)
  }

  return Object.freeze({
    capabilities: Object.freeze(capabilities),
    providers: Object.freeze(providers),
    bootstrapOrder: Object.freeze(bootstrapOrder),
  })
}

function selectedProvidersAt(plan: CompositionPlan, scope: CapabilityScope): readonly PlannedProvider[] {
  const byId = new Map(plan.providers.map(provider => [provider.id, provider] as const))
  return plan.bootstrapOrder
    .map(id => byId.get(id)!)
    .filter(provider => provider.scope === scope)
}

function scopeIsolation(plan: CompositionPlan, scope: CapabilityScope): readonly string[] {
  return normalizeServiceNames(
    selectedProvidersAt(plan, scope)
      .filter(provider => provider.setup !== undefined)
      .map(provider => provider.capability),
  )
}

async function prepareCapabilityScope(
  plan: CompositionPlan,
  scope: CapabilityScope,
  ctx: Context,
  signal: AbortSignal,
): Promise<CapabilityProviderSetupCommit | void> {
  const commits: CapabilityProviderSetupCommit[] = []
  for (const provider of selectedProvidersAt(plan, scope)) {
    if (signal.aborted) throw signal.reason
    for (const dependency of provider.requires) {
      if (ctx.get(dependency) === undefined) {
        throw new CapabilityProviderUnavailableError(
          `provider "${provider.id}" cannot resolve dependency "${dependency}" while preparing ${scope} scope`,
        )
      }
    }

    if (provider.setup !== undefined) {
      const result = await raceAbort(provider.setup({ ctx, scope, signal }), signal)
      if (result !== undefined) {
        if (typeof result !== 'object' || result === null || typeof result.commit !== 'function') {
          throw new TypeError(`provider "${provider.id}" setup must return void or { commit(): void }`)
        }
        commits.push(result)
      }
    }

    if (ctx.get(provider.capability) === undefined) {
      throw new CapabilityProviderUnavailableError(
        `provider "${provider.id}" did not make capability "${provider.capability}" available in ${scope} scope`,
      )
    }
  }

  if (commits.length === 0) return
  return {
    commit() {
      for (const commit of commits) commit.commit()
    },
  }
}

export function tenantDefinitionFromPlan(plan: CompositionPlan): TenantScopeDefinition {
  const isolateServices = scopeIsolation(plan, 'tenant')
  return {
    isolateServices,
    setup: ({ ctx, signal }: RuntimeScopePreparation<TenantIdentity>) => prepareCapabilityScope(
      plan,
      'tenant',
      ctx,
      signal,
    ),
  }
}

export function principalDefinitionFromPlan(plan: CompositionPlan): PrincipalScopeDefinition {
  const isolateServices = scopeIsolation(plan, 'principal')
  return {
    isolateServices,
    setup: ({ ctx, signal }: RuntimeScopePreparation<TenantPrincipal>) => prepareCapabilityScope(
      plan,
      'principal',
      ctx,
      signal,
    ),
  }
}

export function operationDefinitionFromPlan(plan: CompositionPlan): OperationScopeDefinition {
  const isolateServices = scopeIsolation(plan, 'operation')
  return {
    isolateServices,
    setup: ({ ctx, signal }: OperationScopePreparation) => prepareCapabilityScope(
      plan,
      'operation',
      ctx,
      signal,
    ),
  }
}

export interface DeploymentComposition {
  readonly ctx: Context
  dispose(): Promise<void>
}

function deploymentCompositionOwner(): void {}

export async function bootstrapDeploymentComposition(
  ctx: Context,
  plan: CompositionPlan,
): Promise<DeploymentComposition> {
  const fiber: Fiber = ctx.plugin(deploymentCompositionOwner)
  await fiber.await()
  const abort = new AbortController()
  fiber.ctx.effect(() => () => {
    if (!abort.signal.aborted) abort.abort(new CompositionError('deployment composition disposed'))
  }, 'saasComposition.deploymentAbort()')

  try {
    const prepared = await prepareCapabilityScope(plan, 'deployment', fiber.ctx, abort.signal)
    fiber.assertActive()
    prepared?.commit()
    fiber.assertActive()
  } catch (error) {
    await disposeFiber(fiber)
    throw error
  }

  return {
    ctx: fiber.ctx,
    dispose: () => disposeFiber(fiber),
  }
}
