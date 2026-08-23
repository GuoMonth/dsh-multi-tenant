import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
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
import { TenantRuntimeService } from '../src/runtime.ts'

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

describe('v0.3 composition compiler', () => {
  it('normalizes equivalent definitions into one deterministic immutable plan', () => {
    const capabilities = [
      { key: 'agents', scope: 'deployment', required: true },
      { key: 'tenantConfig', scope: 'tenant', required: true },
      { key: 'credentials', scope: 'principal', required: true },
      { key: 'requestMarker', scope: 'operation', required: true },
    ] as const
    const providers = [
      { id: 'ambient-agents', capability: 'agents', scope: 'deployment' },
      { id: 'tenant-config', capability: 'tenantConfig', scope: 'tenant', setup() {} },
      {
        id: 'credentials',
        capability: 'credentials',
        scope: 'principal',
        requires: ['tenantConfig'],
        setup() {},
      },
      {
        id: 'request-marker',
        capability: 'requestMarker',
        scope: 'operation',
        requires: ['agents', 'credentials'],
        setup() {},
      },
    ] as const

    const first = compileSaaSDefinition({ capabilities, providers })
    const second = compileSaaSDefinition({
      capabilities: reorder(capabilities),
      providers: reorder(providers),
    })

    expect(second).toEqual(first)
    expect(first.bootstrapOrder).toEqual([
      'ambient-agents',
      'tenant-config',
      'credentials',
      'request-marker',
    ])
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.capabilities)).toBe(true)
    expect(Object.isFrozen(first.providers)).toBe(true)
    expect(Object.isFrozen(first.bootstrapOrder)).toBe(true)
  })

  it('fails before bootstrap on missing, ambiguous and scope-invalid composition', () => {
    expect(() => compileSaaSDefinition({
      capabilities: [{ key: 'credentials', scope: 'principal', required: true }],
    })).toThrow(MissingCapabilityProviderError)

    expect(() => compileSaaSDefinition({
      capabilities: [{ key: 'credentials', scope: 'principal', required: true }],
      providers: [
        { id: 'a', capability: 'credentials', scope: 'principal' },
        { id: 'b', capability: 'credentials', scope: 'principal' },
      ],
    })).toThrow(AmbiguousCapabilityProviderError)

    expect(() => compileSaaSDefinition({
      capabilities: [{ key: 'tenantConfig', scope: 'tenant', required: true }],
      providers: [{ id: 'wrong', capability: 'tenantConfig', scope: 'principal' }],
    })).toThrow(CapabilityScopeMismatchError)
  })

  it('rejects dependency visibility violations and cycles structurally', () => {
    expect(() => compileSaaSDefinition({
      capabilities: [
        { key: 'tenantPolicy', scope: 'tenant', required: true },
        { key: 'principalSecret', scope: 'principal', required: true },
      ],
      providers: [
        {
          id: 'tenant-policy',
          capability: 'tenantPolicy',
          scope: 'tenant',
          requires: ['principalSecret'],
        },
        { id: 'principal-secret', capability: 'principalSecret', scope: 'principal' },
      ],
    })).toThrow(CapabilityDependencyVisibilityError)

    expect(() => compileSaaSDefinition({
      capabilities: [
        { key: 'a', scope: 'principal', required: true },
        { key: 'b', scope: 'principal', required: true },
      ],
      providers: [
        { id: 'a-provider', capability: 'a', scope: 'principal', requires: ['b'] },
        { id: 'b-provider', capability: 'b', scope: 'principal', requires: ['a'] },
      ],
    })).toThrow(CapabilityDependencyCycleError)
  })

  it('materializes one plan through deployment, Tenant, Principal and Operation scopes', async () => {
    const { ctx, runtime } = await createRuntime()
    const ambient = ctx.plugin(function ambientAgentLikeProvider(providerCtx: Context) {
      providerCtx.provide('agents', { marker: 'deployment-agents' })
    })
    await ambient

    const definition: SaaSDefinition = {
      capabilities: [
        { key: 'agents', scope: 'deployment', required: true },
        { key: 'tenantConfig', scope: 'tenant', required: true },
        { key: 'credentials', scope: 'principal', required: true },
        { key: 'requestMarker', scope: 'operation', required: true },
      ],
      providers: [
        { id: 'ambient-agents', capability: 'agents', scope: 'deployment' },
        {
          id: 'tenant-config',
          capability: 'tenantConfig',
          scope: 'tenant',
          setup({ ctx: tenantCtx }) {
            tenantCtx.provide('tenantConfig', `config:${String(tenantCtx.tenantRuntime === runtime)}`)
          },
        },
        {
          id: 'principal-credentials',
          capability: 'credentials',
          scope: 'principal',
          requires: ['tenantConfig'],
          setup({ ctx: principalCtx }) {
            const identity = principalCtx.tenantRuntime === runtime
            principalCtx.provide('credentials', `credential:${String(identity)}`)
          },
        },
        {
          id: 'operation-marker',
          capability: 'requestMarker',
          scope: 'operation',
          requires: ['credentials'],
          setup({ ctx: operationCtx }) {
            operationCtx.provide('requestMarker', 'operation-ready')
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
      requires: ['agents', 'tenantConfig', 'credentials', 'requestMarker'],
      execute({ capabilities }) {
        return {
          agents: capabilities.require<{ marker: string }>('agents').marker,
          tenant: capabilities.require<string>('tenantConfig'),
          credential: capabilities.require<string>('credentials'),
          operation: capabilities.require<string>('requestMarker'),
        }
      },
    })

    await expect(operation.result).resolves.toEqual({
      agents: 'deployment-agents',
      tenant: 'config:true',
      credential: 'credential:true',
      operation: 'operation-ready',
    })
    expect(operation.state).toBe('disposed')

    await tenant.dispose()
    await deployment.dispose()
    await ambient.dispose()
    await ctx.fiber.dispose()
  })
})
