import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { InMemoryTenantSessionStore, MultiTenantService } from '../src/index.ts'
import {
  MultiTenantRuntimeError,
  TenantRuntimeService,
  principalOf,
  tenantIdOf,
} from '../src/runtime.ts'
import { ValidationError } from '../src/errors.ts'

function provideMarker(ctx: Context, config: { name: string; value: string }): void {
  ctx.provide(config.name, config.value)
}

async function createRuntime(): Promise<{ ctx: Context; runtime: TenantRuntimeService }> {
  const ctx = new Context()
  await ctx.plugin(InMemoryTenantSessionStore)
  await ctx.plugin(MultiTenantService)
  await ctx.plugin(TenantRuntimeService)
  return { ctx, runtime: ctx.get('tenantRuntime') as TenantRuntimeService }
}

describe('TenantRuntimeService', () => {
  it('creates real tenant-local Cordis service graphs without an ad-hoc service registry', async () => {
    const { ctx, runtime } = await createRuntime()
    await ctx.plugin(provideMarker, { name: 'sharedAdapter', value: 'shared' })

    const tenantA = runtime.createTenant('acme', { isolateServices: ['tenantAuth', 'tenantMcp'] })
    const tenantB = runtime.createTenant('globex', { isolateServices: ['tenantAuth', 'tenantMcp'] })

    await tenantA.ctx.plugin(provideMarker, { name: 'tenantAuth', value: 'auth-A' })
    await tenantA.ctx.plugin(provideMarker, { name: 'tenantMcp', value: 'mcp-A' })
    await tenantB.ctx.plugin(provideMarker, { name: 'tenantAuth', value: 'auth-B' })
    await tenantB.ctx.plugin(provideMarker, { name: 'tenantMcp', value: 'mcp-B' })

    expect(tenantA.ctx.get('tenantAuth')).toBe('auth-A')
    expect(tenantA.ctx.get('tenantMcp')).toBe('mcp-A')
    expect(tenantB.ctx.get('tenantAuth')).toBe('auth-B')
    expect(tenantB.ctx.get('tenantMcp')).toBe('mcp-B')
    expect(ctx.get('tenantAuth')).toBeUndefined()
    expect(ctx.get('tenantMcp')).toBeUndefined()

    // Non-isolated deployment services are intentionally shared.
    expect(tenantA.ctx.get('sharedAdapter')).toBe('shared')
    expect(tenantB.ctx.get('sharedAdapter')).toBe('shared')

    // Prove the v0.1 kernel is one shared persistent invariant by behavior,
    // rather than comparing Cordis trace proxies (whose identity is caller-bound).
    const alice = { tenantId: 'acme', userId: 'alice' }
    await tenantA.ctx.multiTenant.claimSession('shared-kernel', alice)
    await expect(ctx.multiTenant.getSessionOwner('shared-kernel')).resolves.toEqual(alice)
    await expect(tenantB.ctx.multiTenant.canAccessSession(
      { tenantId: 'globex', userId: 'bob' },
      'shared-kernel',
    )).resolves.toBe(false)
  })

  it('adds a principal-local capability layer below the tenant layer', async () => {
    const { runtime } = await createRuntime()
    const tenant = runtime.createTenant('acme', { isolateServices: ['tenantAuth'] })
    await tenant.ctx.plugin(provideMarker, { name: 'tenantAuth', value: 'acme-auth' })

    const alice = tenant.createPrincipal(
      { tenantId: 'acme', userId: 'alice' },
      { isolateServices: ['userCredentials'] },
    )
    const bob = tenant.createPrincipal(
      { tenantId: 'acme', userId: 'bob' },
      { isolateServices: ['userCredentials'] },
    )
    await alice.ctx.plugin(provideMarker, { name: 'userCredentials', value: 'alice-token' })
    await bob.ctx.plugin(provideMarker, { name: 'userCredentials', value: 'bob-token' })

    expect(alice.ctx.get('tenantAuth')).toBe('acme-auth')
    expect(bob.ctx.get('tenantAuth')).toBe('acme-auth')
    expect(alice.ctx.get('userCredentials')).toBe('alice-token')
    expect(bob.ctx.get('userCredentials')).toBe('bob-token')
    expect(tenant.ctx.get('userCredentials')).toBeUndefined()

    expect(tenantIdOf(alice.ctx)).toBe('acme')
    expect(tenantIdOf(bob.ctx)).toBe('acme')
    expect(principalOf(alice.ctx)).toEqual({ tenantId: 'acme', userId: 'alice' })
    expect(principalOf(bob.ctx)).toEqual({ tenantId: 'acme', userId: 'bob' })
    expect(principalOf(tenant.ctx)).toBeUndefined()
  })

  it('rejects a principal from another tenant before any capability scope exists', async () => {
    const { runtime } = await createRuntime()
    const tenant = runtime.createTenant('acme')

    expect(() => tenant.createPrincipal({ tenantId: 'globex', userId: 'eve' }))
      .toThrow(ValidationError)
  })

  it('refuses duplicate live tenant graphs and allows recreation after disposal', async () => {
    const { runtime } = await createRuntime()
    const first = runtime.createTenant('acme')

    expect(() => runtime.createTenant('acme')).toThrow(MultiTenantRuntimeError)
    await first.dispose()

    const second = runtime.createTenant('acme')
    expect(second).not.toBe(first)
    await second.dispose()
  })

  it('forbids isolating the ownership kernel or Cordis core services', async () => {
    const { runtime } = await createRuntime()

    expect(() => runtime.createTenant('acme', { isolateServices: ['multiTenant'] }))
      .toThrow(ValidationError)
    expect(() => runtime.createTenant('globex', { isolateServices: ['registry'] }))
      .toThrow(ValidationError)
  })

  it('keeps ownership authorization effective inside a principal context', async () => {
    const { ctx, runtime } = await createRuntime()
    const acme = runtime.createTenant('acme')
    const globex = runtime.createTenant('globex')
    const alice = acme.createPrincipal({ tenantId: 'acme', userId: 'alice' })
    const eve = globex.createPrincipal({ tenantId: 'globex', userId: 'eve' })

    await alice.ctx.multiTenant.claimSession('session-a', alice.principal)
    await expect(alice.ctx.multiTenant.canAccessSession(alice.principal, 'session-a')).resolves.toBe(true)
    await expect(eve.ctx.multiTenant.canAccessSession(eve.principal, 'session-a')).resolves.toBe(false)
    await expect(ctx.multiTenant.getSessionOwner('session-a')).resolves.toEqual(alice.principal)
  })
})
