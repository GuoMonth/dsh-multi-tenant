import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { defineCapability, provideCapability } from '../src/capability.ts'
import {
  AmbiguousCapabilityProviderError,
  CapabilityDependencyCycleError,
  CapabilityDependencyVisibilityError,
  CapabilityScopeMismatchError,
  MissingCapabilityProviderError,
  bootstrapDeploymentComposition,
  compileSaaSDefinition,
  operationDefinitionFromPlan,
  principalDefinitionFromPlan,
  tenantDefinitionFromPlan,
  type SaaSDefinition,
} from '../src/composition.ts'
import { InMemoryTenantSessionStore } from '../src/store.ts'
import { MultiTenantService } from '../src/service.ts'
import {
  RuntimeDefinitionConflictError,
  TenantRuntimeService,
  principalOf,
  tenantIdOf,
} from '../src/runtime.ts'

async function createRuntime(): Promise<{ ctx: Context; runtime: TenantRuntimeService }> {
  const ctx = new Context()
  await ctx.plugin(InMemoryTenantSessionStore)
  await ctx.plugin(MultiTenantService)
  await ctx.plugin(TenantRuntimeService)
  return { ctx, runtime: ctx.tenantRuntime }
}

function reorder<T>(items: readonly T[]): T[] {
  return [...items].reverse()
}

const agents = defineCapability<{ marker: string }, 'deployment'>('agents', 'deployment')
const tenantConfig = defineCapability<string, 'tenant'>('tenantConfig', 'tenant')
const credentials = defineCapability<string, 'principal'>('credentials', 'principal')
const requestMarker = defineCapability<string, 'operation'>('requestMarker', 'operation')

describe('v0.3 composition compiler', () => {
  it('normalizes equivalent typed definitions into one deterministic immutable plan', () => {
    const capabilities = [
      { capability: agents, required: true },
      { capability: tenantConfig, required: true },
      { capability: credentials, required: true },
      { capability: requestMarker, required: true },
    ] as const
    const providers = [
      { id: 'ambient-agents', capability: agents },
      { id: 'tenant-config', capability: tenantConfig, setup() {} },
      {
        id: 'credentials',
        capability: credentials,
        requires: [tenantConfig],
        setup() {},
      },
      {
        id: 'request-marker',
        capability: requestMarker,
        requires: [agents, credentials],
        setup() {},
      },
    ] as const

    const first = compileSaaSDefinition({ capabilities, providers })
    const second = compileSaaSDefinition({
      capabilities: reorder(capabilities),
      providers: reorder(providers),
    })

    expect(second).toEqual(first)
    expect(second.fingerprint).toBe(first.fingerprint)
    expect(second.scopeFingerprints).toEqual(first.scopeFingerprints)
    expect(first.bootstrapOrder).toEqual([
      'ambient-agents',
      'tenant-config',
      'credentials',
      'request-marker',
    ])
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.scopeFingerprints)).toBe(true)
    expect(Object.isFrozen(first.capabilities)).toBe(true)
    expect(Object.isFrozen(first.providers)).toBe(true)
    expect(Object.isFrozen(first.bootstrapOrder)).toBe(true)
  })

  it('fails before bootstrap on missing, ambiguous and false-scoped composition', () => {
    expect(() => compileSaaSDefinition({
      capabilities: [{ capability: credentials, required: true }],
    })).toThrow(MissingCapabilityProviderError)

    expect(() => compileSaaSDefinition({
      capabilities: [{ capability: credentials, required: true }],
      providers: [
        { id: 'a', capability: credentials, setup() {} },
        { id: 'b', capability: credentials, setup() {} },
      ],
    })).toThrow(AmbiguousCapabilityProviderError)

    const wrongTenantToken = defineCapability<string, 'principal'>('tenantConfig', 'principal')
    expect(() => compileSaaSDefinition({
      capabilities: [{ capability: tenantConfig, required: true }],
      providers: [{ id: 'wrong', capability: wrongTenantToken, setup() {} }],
    })).toThrow(CapabilityScopeMismatchError)

    const falseScopedAmbient = {
      capabilities: [{ capability: credentials, required: true }],
      providers: [{ id: 'ambient-principal', capability: credentials }],
    } as SaaSDefinition
    expect(() => compileSaaSDefinition(falseScopedAmbient)).toThrow(CapabilityScopeMismatchError)
  })

  it('rejects dependency visibility violations and cycles structurally', () => {
    const tenantPolicy = defineCapability<string, 'tenant'>('tenantPolicy', 'tenant')
    const principalSecret = defineCapability<string, 'principal'>('principalSecret', 'principal')
    expect(() => compileSaaSDefinition({
      capabilities: [
        { capability: tenantPolicy, required: true },
        { capability: principalSecret, required: true },
      ],
      providers: [
        {
          id: 'tenant-policy',
          capability: tenantPolicy,
          requires: [principalSecret],
          setup() {},
        },
        { id: 'principal-secret', capability: principalSecret, setup() {} },
      ],
    })).toThrow(CapabilityDependencyVisibilityError)

    const a = defineCapability<string, 'principal'>('a', 'principal')
    const b = defineCapability<string, 'principal'>('b', 'principal')
    expect(() => compileSaaSDefinition({
      capabilities: [
        { capability: a, required: true },
        { capability: b, required: true },
      ],
      providers: [
        { id: 'a-provider', capability: a, requires: [b], setup() {} },
        { id: 'b-provider', capability: b, requires: [a], setup() {} },
      ],
    })).toThrow(CapabilityDependencyCycleError)
  })

  it('rejects true Tenant creation drift while allowing structurally equivalent joins', async () => {
    const { ctx, runtime } = await createRuntime()
    const capabilities = [{ capability: tenantConfig, required: true }] as const
    const firstPlan = compileSaaSDefinition({
      capabilities,
      providers: [{
        id: 'tenant-config-v1',
        capability: tenantConfig,
        definitionKey: 'profile-v1',
        setup({ ctx: tenantCtx }) { provideCapability(tenantCtx, tenantConfig, 'v1') },
      }],
    })
    const equivalentPlan = compileSaaSDefinition({
      capabilities: reorder(capabilities),
      providers: [{
        id: 'tenant-config-v1',
        capability: tenantConfig,
        definitionKey: 'profile-v1',
        setup({ ctx: tenantCtx }) { provideCapability(tenantCtx, tenantConfig, 'equivalent-v1') },
      }],
    })
    const conflictingPlan = compileSaaSDefinition({
      capabilities,
      providers: [{
        id: 'tenant-config-v2',
        capability: tenantConfig,
        definitionKey: 'profile-v2',
        setup({ ctx: tenantCtx }) { provideCapability(tenantCtx, tenantConfig, 'v2') },
      }],
    })

    expect(equivalentPlan.scopeFingerprints.tenant).toBe(firstPlan.scopeFingerprints.tenant)
    expect(conflictingPlan.scopeFingerprints.tenant).not.toBe(firstPlan.scopeFingerprints.tenant)
    const tenant = await runtime.tenants.ensure('acme', tenantDefinitionFromPlan(firstPlan))
    await expect(runtime.tenants.ensure('acme', tenantDefinitionFromPlan(equivalentPlan))).resolves.toBe(tenant)
    await expect(runtime.tenants.ensure('acme', tenantDefinitionFromPlan(conflictingPlan)))
      .rejects.toThrow(RuntimeDefinitionConflictError)
    expect(tenant.ctx.get(tenantConfig.key)).toBe('v1')

    await tenant.dispose()
    await ctx.fiber.dispose()
  })

  it('localizes canonical identity to each scope dependency closure', async () => {
    const { ctx, runtime } = await createRuntime()
    const deploymentConfig = defineCapability<string, 'deployment'>('deploymentConfig', 'deployment')

    const buildPlan = ({
      deploymentKey = 'deployment-v1',
      tenantKey = 'tenant-v1',
      principalKey = 'principal-v1',
      operationKey = 'operation-v1',
    } = {}) => compileSaaSDefinition({
      capabilities: [
        { capability: deploymentConfig, required: true },
        { capability: tenantConfig, required: true },
        { capability: credentials, required: true },
        { capability: requestMarker, required: true },
      ],
      providers: [
        {
          id: 'deployment-config',
          capability: deploymentConfig,
          definitionKey: deploymentKey,
          setup({ ctx: deploymentCtx }) { provideCapability(deploymentCtx, deploymentConfig, deploymentKey) },
        },
        {
          id: 'tenant-config',
          capability: tenantConfig,
          definitionKey: tenantKey,
          requires: [deploymentConfig],
          setup({ ctx: tenantCtx }) { provideCapability(tenantCtx, tenantConfig, tenantKey) },
        },
        {
          id: 'principal-credentials',
          capability: credentials,
          definitionKey: principalKey,
          requires: [tenantConfig],
          setup({ ctx: principalCtx }) { provideCapability(principalCtx, credentials, principalKey) },
        },
        {
          id: 'operation-marker',
          capability: requestMarker,
          definitionKey: operationKey,
          requires: [credentials],
          setup({ ctx: operationCtx }) { provideCapability(operationCtx, requestMarker, operationKey) },
        },
      ],
    })

    const base = buildPlan()
    const operationOnly = buildPlan({ operationKey: 'operation-v2' })
    const principalOnly = buildPlan({ principalKey: 'principal-v2' })
    const tenantOnly = buildPlan({ tenantKey: 'tenant-v2' })
    const deploymentDependency = buildPlan({ deploymentKey: 'deployment-v2' })

    expect(operationOnly.fingerprint).not.toBe(base.fingerprint)
    expect(operationOnly.scopeFingerprints.operation).not.toBe(base.scopeFingerprints.operation)
    expect(operationOnly.scopeFingerprints.principal).toBe(base.scopeFingerprints.principal)
    expect(operationOnly.scopeFingerprints.tenant).toBe(base.scopeFingerprints.tenant)

    expect(principalOnly.scopeFingerprints.principal).not.toBe(base.scopeFingerprints.principal)
    expect(principalOnly.scopeFingerprints.tenant).toBe(base.scopeFingerprints.tenant)

    expect(tenantOnly.scopeFingerprints.tenant).not.toBe(base.scopeFingerprints.tenant)
    expect(deploymentDependency.scopeFingerprints.tenant).not.toBe(base.scopeFingerprints.tenant)
    expect(deploymentDependency.scopeFingerprints.principal).not.toBe(base.scopeFingerprints.principal)

    const deployment = await bootstrapDeploymentComposition(ctx, base)
    const tenant = await runtime.tenants.ensure('acme', tenantDefinitionFromPlan(base))
    const alice = await tenant.principals.ensure('alice', principalDefinitionFromPlan(base))

    await expect(runtime.tenants.ensure('acme', tenantDefinitionFromPlan(operationOnly))).resolves.toBe(tenant)
    await expect(tenant.principals.ensure('alice', principalDefinitionFromPlan(operationOnly))).resolves.toBe(alice)
    await expect(tenant.principals.ensure('alice', principalDefinitionFromPlan(principalOnly)))
      .rejects.toThrow(RuntimeDefinitionConflictError)
    await expect(runtime.tenants.ensure('acme', tenantDefinitionFromPlan(tenantOnly)))
      .rejects.toThrow(RuntimeDefinitionConflictError)

    await tenant.dispose()
    await deployment.dispose()
    await ctx.fiber.dispose()
  })

  it('materializes typed capabilities through deployment, Tenant, Principal and Operation scopes', async () => {
    const { ctx, runtime } = await createRuntime()
    const ambient = ctx.plugin(function ambientAgentLikeProvider(providerCtx: Context) {
      provideCapability(providerCtx, agents, { marker: 'deployment-agents' })
    })
    await ambient

    const definition: SaaSDefinition = {
      capabilities: [
        { capability: agents, required: true },
        { capability: tenantConfig, required: true },
        { capability: credentials, required: true },
        { capability: requestMarker, required: true },
      ],
      providers: [
        { id: 'ambient-agents', capability: agents },
        {
          id: 'tenant-config',
          capability: tenantConfig,
          setup({ ctx: tenantCtx }) {
            provideCapability(tenantCtx, tenantConfig, `tenant:${tenantIdOf(tenantCtx)}`)
          },
        },
        {
          id: 'principal-credentials',
          capability: credentials,
          requires: [tenantConfig],
          setup({ ctx: principalCtx }) {
            const principal = principalOf(principalCtx)
            provideCapability(principalCtx, credentials, `credential:${principal?.tenantId}/${principal?.userId}`)
          },
        },
        {
          id: 'operation-marker',
          capability: requestMarker,
          requires: [credentials],
          setup({ ctx: operationCtx }) {
            const principal = principalOf(operationCtx)
            provideCapability(operationCtx, requestMarker, `operation:${principal?.tenantId}/${principal?.userId}`)
          },
        },
      ],
    }

    const plan = compileSaaSDefinition(definition)
    const deployment = await bootstrapDeploymentComposition(ctx, plan)
    const tenant = await runtime.tenants.ensure('acme', tenantDefinitionFromPlan(plan))
    const alice = await tenant.principals.ensure('alice', principalDefinitionFromPlan(plan))
    const operationScope = operationDefinitionFromPlan(plan)

    const operation = alice.operations.start({
      ...operationScope,
      requires: [agents, tenantConfig, credentials, requestMarker],
      execute({ capabilities }) {
        return {
          agents: capabilities.require(agents).marker,
          tenant: capabilities.require(tenantConfig),
          credential: capabilities.require(credentials),
          operation: capabilities.require(requestMarker),
        }
      },
    })

    await expect(operation.result).resolves.toEqual({
      agents: 'deployment-agents',
      tenant: 'tenant:acme',
      credential: 'credential:acme/alice',
      operation: 'operation:acme/alice',
    })
    expect(operation.state).toBe('disposed')

    await tenant.dispose()
    await deployment.dispose()
    await ambient.dispose()
    await ctx.fiber.dispose()
  })
})
