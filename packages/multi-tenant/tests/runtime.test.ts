import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { InMemoryTenantSessionStore, MultiTenantService } from '../src/index.ts'
import {
  RuntimeDefinitionConflictError,
  RuntimeRegistryClosedError,
  TenantRuntimeService,
  principalOf,
  runtimeIdentityOf,
  tenantIdOf,
} from '../src/runtime.ts'
import { ValidationError } from '../src/errors.ts'

async function createRuntime(): Promise<{ ctx: Context; runtime: TenantRuntimeService }> {
  const ctx = new Context()
  await ctx.plugin(InMemoryTenantSessionStore)
  await ctx.plugin(MultiTenantService)
  await ctx.plugin(TenantRuntimeService)
  return { ctx, runtime: ctx.tenantRuntime }
}

describe('TenantRuntimeService runtime contract', () => {
  it('publishes a tenant atomically and single-flights concurrent ensure calls', async () => {
    const { runtime } = await createRuntime()
    const gate = Promise.withResolvers<void>()
    let setupRuns = 0
    let commitRuns = 0

    const first = runtime.tenants.ensure('acme', {
      isolateServices: ['tenantAuth'],
      setup: async ({ ctx, identity }) => {
        setupRuns += 1
        expect(identity).toEqual({ tenantId: 'acme' })
        ctx.provide('tenantAuth', 'auth-A')
        await gate.promise
        return { commit: () => { commitRuns += 1 } }
      },
    })
    const second = runtime.tenants.ensure('acme', {
      isolateServices: ['tenantAuth'],
      setup: () => { throw new Error('second initializer must never run') },
    })

    expect(runtime.tenants.get('acme')).toBeUndefined()
    expect(setupRuns).toBe(1)

    gate.resolve()
    const [tenantA, tenantB] = await Promise.all([first, second])

    expect(tenantA).toBe(tenantB)
    expect(await runtime.tenants.ensure('acme')).toBe(tenantA)
    expect(runtime.tenants.get('acme')).toBe(tenantA)
    expect(tenantA.state).toBe('active')
    expect(tenantA.ctx.get('tenantAuth')).toBe('auth-A')
    expect(commitRuns).toBe(1)
  })

  it('rolls back failed unpublished setup and permits a clean retry', async () => {
    const { ctx, runtime } = await createRuntime()

    await expect(runtime.tenants.ensure('acme', {
      isolateServices: ['tenantAuth'],
      setup: ({ ctx: tenantCtx }) => {
        tenantCtx.provide('tenantAuth', 'should-never-publish')
        throw new Error('boom')
      },
    })).rejects.toThrow('boom')

    expect(runtime.tenants.get('acme')).toBeUndefined()
    expect(ctx.get('tenantAuth')).toBeUndefined()

    const tenant = await runtime.tenants.ensure('acme', {
      isolateServices: ['tenantAuth'],
      setup: ({ ctx: tenantCtx }) => { tenantCtx.provide('tenantAuth', 'auth-A') },
    })
    expect(tenant.ctx.get('tenantAuth')).toBe('auth-A')
  })

  it('uses the same canonical registry semantics for principals', async () => {
    const { runtime } = await createRuntime()
    const tenant = await runtime.tenants.ensure('acme', {
      isolateServices: ['tenantAuth'],
      setup: ({ ctx }) => { ctx.provide('tenantAuth', 'acme-auth') },
    })

    let aliceSetups = 0
    const alice1 = tenant.principals.ensure('alice', {
      isolateServices: ['userCredentials'],
      setup: ({ ctx, identity }) => {
        aliceSetups += 1
        expect(identity).toEqual({ tenantId: 'acme', userId: 'alice' })
        ctx.provide('userCredentials', 'alice-token')
      },
    })
    const alice2 = tenant.principals.ensure('alice', {
      isolateServices: ['userCredentials'],
    })
    const bob = tenant.principals.ensure('bob', {
      isolateServices: ['userCredentials'],
      setup: ({ ctx }) => { ctx.provide('userCredentials', 'bob-token') },
    })

    const [a1, a2, b] = await Promise.all([alice1, alice2, bob])
    expect(a1).toBe(a2)
    expect(await tenant.principals.ensure('alice')).toBe(a1)
    expect(aliceSetups).toBe(1)
    expect(a1.identity).toEqual({ tenantId: 'acme', userId: 'alice' })
    expect(b.identity).toEqual({ tenantId: 'acme', userId: 'bob' })
    expect(a1.ctx.get('tenantAuth')).toBe('acme-auth')
    expect(b.ctx.get('tenantAuth')).toBe('acme-auth')
    expect(a1.ctx.get('userCredentials')).toBe('alice-token')
    expect(b.ctx.get('userCredentials')).toBe('bob-token')
    expect(tenant.ctx.get('userCredentials')).toBeUndefined()

    expect(runtimeIdentityOf(a1.ctx)).toEqual({
      tenant: { tenantId: 'acme' },
      principal: { tenantId: 'acme', userId: 'alice' },
    })
    expect(tenantIdOf(a1.ctx)).toBe('acme')
    expect(principalOf(a1.ctx)).toEqual({ tenantId: 'acme', userId: 'alice' })
  })

  it('rejects definition drift for an already active canonical node', async () => {
    const { runtime } = await createRuntime()
    await runtime.tenants.ensure('acme', { isolateServices: ['tenantAuth'] })

    await expect(runtime.tenants.ensure('acme', { isolateServices: ['tenantMcp'] }))
      .rejects.toThrow(RuntimeDefinitionConflictError)
  })

  it('cascades lifecycle ownership and allows recreation only after quiescent disposal', async () => {
    const { runtime } = await createRuntime()
    const disposed: string[] = []
    const lifecyclePlugin = (ctx: Context, name: string): (() => void) => {
      ctx.provide('lifecycleMarker', name)
      return () => { disposed.push(name) }
    }

    const tenant = await runtime.tenants.ensure('acme', { isolateServices: ['lifecycleMarker'] })
    await tenant.ctx.plugin(lifecyclePlugin, 'tenant-A')
    const alice = await tenant.principals.ensure('alice', { isolateServices: ['userCredentials'] })
    await alice.ctx.plugin((ctx: Context) => {
      ctx.provide('userCredentials', 'alice-token')
      return () => { disposed.push('alice') }
    })

    expect(runtime.tenants.get('acme')).toBe(tenant)
    expect(tenant.principals.get('alice')).toBe(alice)

    await tenant.dispose()

    expect(tenant.state).toBe('disposed')
    expect(alice.state).toBe('disposed')
    expect(runtime.tenants.get('acme')).toBeUndefined()
    expect(disposed).toContain('alice')
    expect(disposed).toContain('tenant-A')

    const replacement = await runtime.tenants.ensure('acme', { isolateServices: ['lifecycleMarker'] })
    expect(replacement).not.toBe(tenant)
    expect(replacement.state).toBe('active')
  })

  it('closes child admission and cancels unpublished principal setup during tenant teardown', async () => {
    const { runtime } = await createRuntime()
    const tenant = await runtime.tenants.ensure('acme')
    const started = Promise.withResolvers<void>()

    const pendingAlice = tenant.principals.ensure('alice', {
      setup: async ({ signal }) => {
        started.resolve()
        await new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      },
    })

    await started.promise
    expect(tenant.principals.get('alice')).toBeUndefined()

    const disposing = tenant.dispose()
    await expect(pendingAlice).rejects.toThrow(RuntimeRegistryClosedError)
    await disposing

    expect(tenant.state).toBe('disposed')
    await expect(tenant.principals.ensure('bob')).rejects.toThrow(RuntimeRegistryClosedError)
  })

  it('keeps ownership authorization shared across the runtime tree', async () => {
    const { ctx, runtime } = await createRuntime()
    const acme = await runtime.tenants.ensure('acme')
    const globex = await runtime.tenants.ensure('globex')
    const alice = await acme.principals.ensure('alice')
    const eve = await globex.principals.ensure('eve')

    await alice.ctx.multiTenant.claimSession('session-a', alice.identity)
    await expect(alice.ctx.multiTenant.canAccessSession(alice.identity, 'session-a')).resolves.toBe(true)
    await expect(eve.ctx.multiTenant.canAccessSession(eve.identity, 'session-a')).resolves.toBe(false)
    await expect(ctx.multiTenant.getSessionOwner('session-a')).resolves.toEqual(alice.identity)
  })

  it('keeps security/kernel services shared and validates principal keys', async () => {
    const { runtime } = await createRuntime()

    await expect(runtime.tenants.ensure('acme', { isolateServices: ['multiTenant'] }))
      .rejects.toThrow(ValidationError)
    await expect(runtime.tenants.ensure('globex', { isolateServices: ['registry'] }))
      .rejects.toThrow(ValidationError)

    const tenant = await runtime.tenants.ensure('initech')
    await expect(tenant.principals.ensure(' ')).rejects.toThrow(ValidationError)
  })
})
