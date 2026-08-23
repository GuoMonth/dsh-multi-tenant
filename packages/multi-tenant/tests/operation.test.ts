import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { InMemoryTenantSessionStore } from '../src/store.ts'
import { MultiTenantService } from '../src/service.ts'
import { TenantRuntimeService } from '../src/runtime.ts'
import {
  OperationDependencyUnavailableError,
  OperationRegistryClosedError,
} from '../src/operation.ts'

async function createRuntime(): Promise<{ ctx: Context; runtime: TenantRuntimeService }> {
  const ctx = new Context()
  await ctx.plugin(InMemoryTenantSessionStore)
  await ctx.plugin(MultiTenantService)
  await ctx.plugin(TenantRuntimeService)
  return { ctx, runtime: ctx.tenantRuntime }
}

describe('Principal-owned one-shot Operations', () => {
  it('captures required capabilities once and never re-executes work after provider churn', async () => {
    const { ctx, runtime } = await createRuntime()
    const providerOne = ctx.plugin(function providerOne(providerCtx: Context) {
      providerCtx.provide('volatileCapability', 'v1')
    })
    await providerOne

    const tenant = await runtime.tenants.ensure('acme')
    const alice = await tenant.principals.ensure('alice')
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let executions = 0

    const operation = alice.operations.start({
      requires: ['volatileCapability'],
      async execute({ capabilities }) {
        executions += 1
        const captured = capabilities.require<string>('volatileCapability')
        started.resolve()
        await release.promise
        return captured
      },
    })

    await started.promise
    await providerOne.dispose()
    const providerTwo = ctx.plugin(function providerTwo(providerCtx: Context) {
      providerCtx.provide('volatileCapability', 'v2')
    })
    await providerTwo
    release.resolve()

    await expect(operation.result).resolves.toBe('v1')
    expect(executions).toBe(1)
    expect(operation.state).toBe('disposed')
    expect(operation.signal.aborted).toBe(false)
    expect(alice.operations.size).toBe(0)

    await providerTwo.dispose()
    await tenant.dispose()
    await ctx.fiber.dispose()
  })

  it('fails before externally visible work when a required capability is unavailable', async () => {
    const { ctx, runtime } = await createRuntime()
    const tenant = await runtime.tenants.ensure('acme')
    const alice = await tenant.principals.ensure('alice')
    let executions = 0

    const operation = alice.operations.start({
      requires: ['missingCapability'],
      execute() {
        executions += 1
      },
    })

    await expect(operation.result).rejects.toThrow(OperationDependencyUnavailableError)
    expect(executions).toBe(0)
    expect(operation.state).toBe('disposed')
    expect(operation.signal.aborted).toBe(false)

    await tenant.dispose()
    await ctx.fiber.dispose()
  })

  it('drains active Operations before Principal teardown finishes', async () => {
    const { ctx, runtime } = await createRuntime()
    const tenant = await runtime.tenants.ensure('acme')
    const alice = await tenant.principals.ensure('alice')
    const started = Promise.withResolvers<void>()
    let cleanupRuns = 0

    const operation = alice.operations.start({
      setup({ ctx: operationCtx }) {
        operationCtx.effect(() => () => { cleanupRuns += 1 }, 'operation-test-cleanup')
      },
      async execute({ signal }) {
        started.resolve()
        await new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      },
    })

    await started.promise
    const disposing = alice.dispose()
    await expect(operation.result).rejects.toThrow(OperationRegistryClosedError)
    await disposing

    expect(operation.state).toBe('disposed')
    expect(operation.signal.aborted).toBe(true)
    expect(cleanupRuns).toBe(1)
    expect(alice.state).toBe('disposed')
    expect(alice.operations.accepting).toBe(false)
    expect(() => alice.operations.start({ execute() {} })).toThrow(OperationRegistryClosedError)

    await tenant.dispose()
    await ctx.fiber.dispose()
  })

  it('makes repeated cancellation/disposal idempotent and quiescent', async () => {
    const { ctx, runtime } = await createRuntime()
    const tenant = await runtime.tenants.ensure('acme')
    const alice = await tenant.principals.ensure('alice')
    const started = Promise.withResolvers<void>()
    let cleanupRuns = 0

    const operation = alice.operations.start({
      setup({ ctx: operationCtx }) {
        operationCtx.effect(() => () => { cleanupRuns += 1 }, 'operation-idempotence-cleanup')
      },
      async execute({ signal }) {
        started.resolve()
        await new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      },
    })

    await started.promise
    await Promise.all([operation.cancel(), operation.cancel(), operation.dispose()])
    await expect(operation.result).rejects.toThrow()
    expect(cleanupRuns).toBe(1)
    expect(operation.state).toBe('disposed')
    expect(operation.signal.aborted).toBe(true)

    await tenant.dispose()
    await ctx.fiber.dispose()
  })
})
