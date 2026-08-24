import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { defineCapability, provideCapability } from '../src/capability.ts'
import { compileSaaSDefinition } from '../src/composition.ts'
import {
  materializeRuntimeComposition,
  RuntimeCompositionCapabilityError,
  RuntimeCompositionConflictError,
} from '../src/runtime-composition.ts'
import { InMemoryTenantSessionStore } from '../src/store.ts'
import { MultiTenantService } from '../src/service.ts'
import { TenantRuntimeService } from '../src/runtime.ts'

async function createRuntime(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(InMemoryTenantSessionStore)
  await ctx.plugin(MultiTenantService)
  await ctx.plugin(TenantRuntimeService)
  return ctx
}

const tenantMarker = defineCapability<string, 'tenant'>('boundTenantMarker', 'tenant')
const principalMarker = defineCapability<string, 'principal'>('boundPrincipalMarker', 'principal')
const operationMarker = defineCapability<string, 'operation'>('boundOperationMarker', 'operation')

function buildPlan(operationKey = 'operation-v1') {
  return compileSaaSDefinition({
    capabilities: [
      { capability: tenantMarker, required: true },
      { capability: principalMarker, required: true },
      { capability: operationMarker, required: true },
    ],
    providers: [
      {
        id: 'tenant-marker',
        capability: tenantMarker,
        setup({ ctx }) { provideCapability(ctx, tenantMarker, 'tenant-ready') },
      },
      {
        id: 'principal-marker',
        capability: principalMarker,
        requires: [tenantMarker],
        setup({ ctx }) { provideCapability(ctx, principalMarker, 'principal-ready') },
      },
      {
        id: 'operation-marker',
        capability: operationMarker,
        definitionKey: operationKey,
        requires: [principalMarker],
        setup({ ctx }) { provideCapability(ctx, operationMarker, operationKey) },
      },
    ],
  })
}

describe('CompositionPlan <-> materialized Runtime binding', () => {
  it('single-flights one exact Plan and rejects whole-plan mixing on the same root', async () => {
    const ctx = await createRuntime()
    const plan = buildPlan()
    const operationOnlyPlan = buildPlan('operation-v2')

    expect(operationOnlyPlan.fingerprint).not.toBe(plan.fingerprint)
    expect(operationOnlyPlan.scopeFingerprints.tenant).toBe(plan.scopeFingerprints.tenant)
    expect(operationOnlyPlan.scopeFingerprints.principal).toBe(plan.scopeFingerprints.principal)

    const composition = await materializeRuntimeComposition(ctx, plan)
    await expect(materializeRuntimeComposition(ctx, plan)).resolves.toBe(composition)
    await expect(materializeRuntimeComposition(ctx, operationOnlyPlan))
      .rejects.toThrow(RuntimeCompositionConflictError)

    const tenant = await composition.tenants.ensure('acme')
    const alice = await tenant.principals.ensure('alice')
    expect(tenant.attestation).toBe(composition.attestation)
    expect(alice.attestation).toBe(composition.attestation)
    expect(composition.attestation.planFingerprint).toBe(plan.fingerprint)

    const operation = alice.operations.start({
      requires: [tenantMarker, principalMarker, operationMarker],
      execute({ capabilities }) {
        return [
          capabilities.require(tenantMarker),
          capabilities.require(principalMarker),
          capabilities.require(operationMarker),
        ].join('|')
      },
    })
    await expect(operation.result).resolves.toBe('tenant-ready|principal-ready|operation-v1')

    await composition.dispose()
    expect(tenant.runtime.state).toBe('disposed')
    expect(alice.runtime.state).toBe('disposed')

    const replacement = await materializeRuntimeComposition(ctx, operationOnlyPlan)
    const replacementAlice = await replacement.principal({ tenantId: 'acme', userId: 'alice' })
    const replacementOperation = replacementAlice.operations.start({
      requires: [operationMarker],
      execute: ({ capabilities }) => capabilities.require(operationMarker),
    })
    await expect(replacementOperation.result).resolves.toBe('operation-v2')

    await replacement.dispose()
    await ctx.fiber.dispose()
  })

  it('does not let a bound Operation reach a capability outside its Plan', async () => {
    const ctx = await createRuntime()
    const composition = await materializeRuntimeComposition(ctx, buildPlan())
    const alice = await composition.principal({ tenantId: 'acme', userId: 'alice' })
    const undeclared = defineCapability<string, 'principal'>('undeclaredCapability', 'principal')

    expect(() => alice.operations.start({
      requires: [undeclared],
      execute() { return 'must not run' },
    })).toThrow(RuntimeCompositionCapabilityError)

    await composition.dispose()
    await ctx.fiber.dispose()
  })
})
