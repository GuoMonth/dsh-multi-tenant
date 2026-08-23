import type { Context, Fiber } from '@deepseek-ai/cordis'
import {
  assertCapabilityToken,
  type CapabilityScope,
  type CapabilityToken,
} from './capability.ts'
import type { OperationScopeDefinition, OperationScopePreparation } from './operation.ts'
import type {
  PrincipalScopeDefinition,
  RuntimeScopePreparation,
  TenantIdentity,
  TenantScopeDefinition,
} from './runtime.ts'
import type { TenantPrincipal } from './types.ts'
import { disposeFiber, normalizeServiceNames, raceAbort } from './scope.ts'

export type { CapabilityScope, CapabilityToken } from './capability.ts'

export interface CapabilityDefinition<C extends CapabilityToken = CapabilityToken> {
  readonly capability: C
  readonly required?: boolean
  readonly defaultProvider?: string
}

export interface CapabilityProviderSetupCommit {
  commit(): void
}

export interface CapabilityProviderPreparation {
  readonly ctx: Context
  readonly capability: CapabilityToken
  readonly scope: CapabilityScope
  readonly signal: AbortSignal
}

export type CapabilityProviderSetup = (
  preparation: CapabilityProviderPreparation,
) => CapabilityProviderSetupCommit | PromiseLike<CapabilityProviderSetupCommit | void> | void

export interface CapabilityProviderDefinition<C extends CapabilityToken = CapabilityToken> {
  readonly id: string
  readonly capability: C
  readonly requires?: readonly CapabilityToken[]
  /**
   * Stable semantic identity for provider configuration that is not represented
   * by provider id/dependency topology. Callback object identity is never part
   * of a CompositionPlan fingerprint.
   */
  readonly definitionKey?: string
  readonly setup?: CapabilityProviderSetup
}

export interface CapabilityProviderSelection {
  readonly capability: CapabilityToken
  readonly providerId: string
}

export interface SaaSDefinition {
  readonly capabilities: readonly CapabilityDefinition[]
  readonly providers?: readonly CapabilityProviderDefinition[]
  readonly select?: readonly CapabilityProviderSelection[]
}

export interface PlannedCapability {
  readonly capability: CapabilityToken
  readonly required: boolean
  readonly providerId?: string
}

export interface PlannedProvider {
  readonly id: string
  readonly capability: CapabilityToken
  readonly requires: readonly CapabilityToken[]
  readonly definitionKey?: string
  readonly setup?: CapabilityProviderSetup
}

export type CompositionScopeFingerprints = Readonly<Record<CapabilityScope, string>>

export interface CompositionPlan {
  /** Full-plan identity for diagnostics and exact whole-definition comparison. */
  readonly fingerprint: string
  /**
   * Scope-local dependency-closure identities. Canonical Tenant/Principal nodes
   * use these rather than the full Plan so unrelated descendant changes do not
   * invalidate an otherwise identical parent Runtime node.
   */
  readonly scopeFingerprints: CompositionScopeFingerprints
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

function optionalSemanticName(value: string | undefined, label: string): string | undefined {
  return value === undefined ? undefined : semanticName(value, label)
}

function canonicalCapability(
  token: CapabilityToken,
  capabilities: ReadonlyMap<string, CapabilityToken>,
  label: string,
): CapabilityToken {
  assertCapabilityToken(token, label)
  const canonical = capabilities.get(token.key)
  if (canonical === undefined) throw new UnknownCapabilityError(`${label} references unknown capability "${token.key}"`)
  if (canonical.scope !== token.scope) {
    throw new CapabilityScopeMismatchError(
      `${label} references capability "${token.key}" as ${token.scope}-scoped but it is ${canonical.scope}-scoped`,
    )
  }
  return canonical
}

function normalizeDependencies(
  values: readonly CapabilityToken[] | undefined,
  capabilities: ReadonlyMap<string, CapabilityToken>,
  label: string,
): readonly CapabilityToken[] {
  if (values === undefined) return Object.freeze([])
  const unique = new Map<string, CapabilityToken>()
  for (const value of values) {
    const dependency = canonicalCapability(value, capabilities, label)
    unique.set(dependency.key, dependency)
  }
  return Object.freeze([...unique.values()].sort((a, b) => a.key.localeCompare(b.key)))
}

function freezeProvider(
  provider: CapabilityProviderDefinition,
  capability: CapabilityToken,
  requires: readonly CapabilityToken[],
): PlannedProvider {
  const definitionKey = optionalSemanticName(provider.definitionKey, `definitionKey for provider "${provider.id}"`)
  const base = {
    id: semanticName(provider.id, 'provider id'),
    capability,
    requires,
  }
  const identified = definitionKey === undefined ? base : { ...base, definitionKey }
  return Object.freeze(provider.setup === undefined ? identified : { ...identified, setup: provider.setup })
}

function freezeCapability(
  capability: CapabilityToken,
  required: boolean,
  providerId: string | undefined,
): PlannedCapability {
  const base = { capability, required }
  return Object.freeze(providerId === undefined ? base : { ...base, providerId })
}

function serializeProvider(provider: PlannedProvider): object {
  return {
    id: provider.id,
    capability: {
      key: provider.capability.key,
      scope: provider.capability.scope,
    },
    requires: provider.requires.map(dependency => ({
      key: dependency.key,
      scope: dependency.scope,
    })),
    definitionKey: provider.definitionKey ?? null,
    materialization: provider.setup === undefined ? 'ambient' : 'managed',
  }
}

function createPlanFingerprint(
  capabilities: readonly PlannedCapability[],
  providers: readonly PlannedProvider[],
  bootstrapOrder: readonly string[],
): string {
  return JSON.stringify({
    capabilities: capabilities.map(capability => ({
      key: capability.capability.key,
      scope: capability.capability.scope,
      required: capability.required,
      providerId: capability.providerId ?? null,
    })),
    providers: providers.map(serializeProvider),
    bootstrapOrder,
  })
}

function createScopeFingerprints(
  providers: readonly PlannedProvider[],
  bootstrapOrder: readonly string[],
): CompositionScopeFingerprints {
  const providerById = new Map(providers.map(provider => [provider.id, provider] as const))
  const providerByCapability = new Map(providers.map(provider => [provider.capability.key, provider] as const))

  const closureFor = (scope: CapabilityScope): readonly PlannedProvider[] => {
    const included = new Set<string>()
    const visit = (provider: PlannedProvider): void => {
      if (included.has(provider.id)) return
      included.add(provider.id)
      for (const dependency of provider.requires) {
        const dependencyProvider = providerByCapability.get(dependency.key)
        if (dependencyProvider !== undefined) visit(dependencyProvider)
      }
    }

    for (const provider of providers) {
      if (provider.capability.scope === scope) visit(provider)
    }

    return bootstrapOrder
      .filter(providerId => included.has(providerId))
      .map(providerId => providerById.get(providerId)!)
  }

  const fingerprintFor = (scope: CapabilityScope): string => JSON.stringify({
    scope,
    providers: closureFor(scope).map(serializeProvider),
  })

  return Object.freeze({
    deployment: fingerprintFor('deployment'),
    tenant: fingerprintFor('tenant'),
    principal: fingerprintFor('principal'),
    operation: fingerprintFor('operation'),
  })
}

export function compileSaaSDefinition(definition: SaaSDefinition): CompositionPlan {
  if (definition === null || typeof definition !== 'object') throw new TypeError('SaaSDefinition must be an object')
  if (!Array.isArray(definition.capabilities)) throw new TypeError('SaaSDefinition.capabilities must be an array')

  const capabilityTokens = new Map<string, CapabilityToken>()
  const capabilityDefs = new Map<string, CapabilityDefinition>()
  for (const raw of definition.capabilities) {
    if (typeof raw !== 'object' || raw === null) throw new TypeError('capability definition must be an object')
    assertCapabilityToken(raw.capability, 'capability definition')
    const key = raw.capability.key
    const existing = capabilityTokens.get(key)
    if (existing !== undefined) {
      throw new DuplicateCapabilityError(`capability "${key}" is declared more than once`)
    }
    if (raw.defaultProvider !== undefined) semanticName(raw.defaultProvider, `default provider for "${key}"`)
    capabilityTokens.set(key, raw.capability)
    capabilityDefs.set(key, raw)
  }

  const providerDefs = new Map<string, PlannedProvider>()
  const providersByCapability = new Map<string, PlannedProvider[]>()
  for (const raw of definition.providers ?? []) {
    const id = semanticName(raw.id, 'provider id')
    if (providerDefs.has(id)) {
      throw new DuplicateProviderDefinitionError(`provider "${id}" is declared more than once`)
    }
    const capability = canonicalCapability(raw.capability, capabilityTokens, `provider "${id}"`)
    if (raw.setup === undefined && capability.scope !== 'deployment') {
      throw new CapabilityScopeMismatchError(
        `provider "${id}" declares ${capability.scope} ownership but has no scoped materializer; ambient providers are deployment-only`,
      )
    }
    const requires = normalizeDependencies(raw.requires, capabilityTokens, `provider "${id}" dependency`)
    const provider = freezeProvider({ ...raw, id }, capability, requires)
    providerDefs.set(provider.id, provider)
    const list = providersByCapability.get(capability.key) ?? []
    list.push(provider)
    providersByCapability.set(capability.key, list)
  }

  const selections = new Map<string, string>()
  for (const selection of definition.select ?? []) {
    const capability = canonicalCapability(selection.capability, capabilityTokens, 'provider selection')
    const providerId = semanticName(selection.providerId, `selected provider for "${capability.key}"`)
    const existing = selections.get(capability.key)
    if (existing !== undefined && existing !== providerId) {
      throw new InvalidProviderSelectionError(
        `capability "${capability.key}" selects conflicting providers "${existing}" and "${providerId}"`,
      )
    }
    selections.set(capability.key, providerId)
  }

  const capabilities: PlannedCapability[] = []
  const selectedProviders = new Map<string, PlannedProvider>()

  for (const key of [...capabilityTokens.keys()].sort()) {
    const capability = capabilityTokens.get(key)!
    const definitionForCapability = capabilityDefs.get(key)!
    const candidates = [...(providersByCapability.get(key) ?? [])].sort((a, b) => a.id.localeCompare(b.id))
    const requested = selections.get(key) ?? definitionForCapability.defaultProvider
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

    if (selected === undefined && (definitionForCapability.required ?? false)) {
      throw new MissingCapabilityProviderError(`required capability "${key}" has no provider`)
    }
    if (selected !== undefined) selectedProviders.set(key, selected)
    capabilities.push(freezeCapability(capability, definitionForCapability.required ?? false, selected?.id))
  }

  for (const provider of selectedProviders.values()) {
    for (const dependency of provider.requires) {
      const selectedDependency = selectedProviders.get(dependency.key)
      if (selectedDependency === undefined) {
        throw new CapabilityDependencyError(
          `provider "${provider.id}" depends on unbound capability "${dependency.key}"`,
        )
      }
      if (SCOPE_RANK[dependency.scope] > SCOPE_RANK[provider.capability.scope]) {
        throw new CapabilityDependencyVisibilityError(
          `${provider.capability.scope}-scoped provider "${provider.id}" cannot depend on descendant ${dependency.scope}-scoped capability "${dependency.key}"`,
        )
      }
    }
  }

  const providers = [...selectedProviders.values()].sort((a, b) => a.id.localeCompare(b.id))
  const providerById = new Map(providers.map(provider => [provider.id, provider] as const))
  const providerByCapability = new Map(providers.map(provider => [provider.capability.key, provider] as const))
  const indegree = new Map<string, number>(providers.map(provider => [provider.id, 0]))
  const dependents = new Map<string, string[]>()

  for (const provider of providers) {
    for (const dependency of provider.requires) {
      const dependencyProvider = providerByCapability.get(dependency.key)!
      indegree.set(provider.id, (indegree.get(provider.id) ?? 0) + 1)
      const list = dependents.get(dependencyProvider.id) ?? []
      list.push(provider.id)
      dependents.set(dependencyProvider.id, list)
    }
  }

  const ready = providers
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

  const frozenCapabilities = Object.freeze(capabilities)
  const frozenProviders = Object.freeze(providers)
  const frozenOrder = Object.freeze(bootstrapOrder)
  const fingerprint = createPlanFingerprint(frozenCapabilities, frozenProviders, frozenOrder)
  const scopeFingerprints = createScopeFingerprints(frozenProviders, frozenOrder)

  return Object.freeze({
    fingerprint,
    scopeFingerprints,
    capabilities: frozenCapabilities,
    providers: frozenProviders,
    bootstrapOrder: frozenOrder,
  })
}

function selectedProvidersAt(plan: CompositionPlan, scope: CapabilityScope): readonly PlannedProvider[] {
  const byId = new Map(plan.providers.map(provider => [provider.id, provider] as const))
  return plan.bootstrapOrder
    .map(id => byId.get(id)!)
    .filter(provider => provider.capability.scope === scope)
}

function scopeIsolation(plan: CompositionPlan, scope: Exclude<CapabilityScope, 'deployment'>): readonly string[] {
  return normalizeServiceNames(selectedProvidersAt(plan, scope).map(provider => provider.capability.key))
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
      if (ctx.get(dependency.key) === undefined) {
        throw new CapabilityProviderUnavailableError(
          `provider "${provider.id}" cannot resolve dependency "${dependency.key}" while preparing ${scope} scope`,
        )
      }
    }

    if (provider.setup !== undefined) {
      const result = await raceAbort(provider.setup({
        ctx,
        capability: provider.capability,
        scope,
        signal,
      }), signal)
      if (result !== undefined) {
        if (typeof result !== 'object' || result === null || typeof result.commit !== 'function') {
          throw new TypeError(`provider "${provider.id}" setup must return void or { commit(): void }`)
        }
        commits.push(result)
      }
    }

    if (ctx.get(provider.capability.key) === undefined) {
      throw new CapabilityProviderUnavailableError(
        `provider "${provider.id}" did not make capability "${provider.capability.key}" available in ${scope} scope`,
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

function runtimeDefinitionKey(plan: CompositionPlan, scope: 'tenant' | 'principal'): string {
  return `saas:${scope}:${plan.scopeFingerprints[scope]}`
}

export function tenantDefinitionFromPlan(plan: CompositionPlan): TenantScopeDefinition {
  const isolateServices = scopeIsolation(plan, 'tenant')
  return {
    isolateServices,
    definitionKey: runtimeDefinitionKey(plan, 'tenant'),
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
    definitionKey: runtimeDefinitionKey(plan, 'principal'),
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
