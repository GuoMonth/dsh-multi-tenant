import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MultiTenantService,
  SessionAccessDeniedError,
  UnknownSessionError,
} from '../src/index.ts'
import type { SessionOwner, TenantPrincipal } from '../src/index.ts'

const alice: TenantPrincipal = { tenantId: 'acme', userId: 'alice', roles: ['member'] }
const bob: TenantPrincipal = { tenantId: 'acme', userId: 'bob', roles: ['member'] }
const eve: TenantPrincipal = { tenantId: 'evilcorp', userId: 'alice', roles: ['member'] }

describe('MultiTenantService', () => {
  let ctx: Context
  let multiTenant: MultiTenantService

  beforeEach(async () => {
    ctx = new Context()
    await ctx.plugin(MultiTenantService)
    multiTenant = ctx.multiTenant
  })

  it('records the correct owner after bindSession', () => {
    multiTenant.bindSession('s1', alice)
    expect(multiTenant.getSessionOwner('s1')).toEqual({ tenantId: 'acme', userId: 'alice' })
  })

  it('allows the same tenant + same user', () => {
    multiTenant.bindSession('s1', alice)
    expect(multiTenant.canAccessSession(alice, 's1')).toBe(true)
    expect(() => multiTenant.assertSessionAccess(alice, 's1')).not.toThrow()
  })

  it('denies a different tenant', () => {
    multiTenant.bindSession('s1', alice)
    expect(multiTenant.canAccessSession(eve, 's1')).toBe(false)
    expect(() => multiTenant.assertSessionAccess(eve, 's1')).toThrow(SessionAccessDeniedError)
  })

  it('denies a different user in the same tenant by default', () => {
    multiTenant.bindSession('s1', alice)
    expect(multiTenant.canAccessSession(bob, 's1')).toBe(false)
    expect(() => multiTenant.assertSessionAccess(bob, 's1')).toThrow(SessionAccessDeniedError)
  })

  it('denies an unknown session (fail closed)', () => {
    expect(multiTenant.getSessionOwner('missing')).toBeUndefined()
    expect(multiTenant.canAccessSession(alice, 'missing')).toBe(false)
    expect(() => multiTenant.assertSessionAccess(alice, 'missing')).toThrow(UnknownSessionError)
  })

  it('throws a clear, specific error from assertSessionAccess', () => {
    multiTenant.bindSession('s1', alice)
    let caught: unknown
    try {
      multiTenant.assertSessionAccess(eve, 's1')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(SessionAccessDeniedError)
    expect((caught as Error).message).toContain('denied')
    expect((caught as Error).message).toContain('tenant')
  })

  it('denies after unbindSession', () => {
    multiTenant.bindSession('s1', alice)
    multiTenant.unbindSession('s1')
    expect(multiTenant.getSessionOwner('s1')).toBeUndefined()
    expect(multiTenant.canAccessSession(alice, 's1')).toBe(false)
    expect(() => multiTenant.assertSessionAccess(alice, 's1')).toThrow(UnknownSessionError)
  })

  describe('extension point: elevated roles', () => {
    it('can grant cross-user access within a tenant via a subclass', async () => {
      class TenantAdminService extends MultiTenantService {
        protected override canElevatedAccess(principal: TenantPrincipal, owner: SessionOwner): boolean {
          return principal.tenantId === owner.tenantId && principal.roles.includes('tenant-admin')
        }
      }

      const adminCtx = new Context()
      await adminCtx.plugin(TenantAdminService)
      const admin = adminCtx.multiTenant

      const tenantAdmin: TenantPrincipal = { tenantId: 'acme', userId: 'root', roles: ['tenant-admin'] }
      const foreignAdmin: TenantPrincipal = { tenantId: 'evilcorp', userId: 'root', roles: ['tenant-admin'] }

      admin.bindSession('s1', alice)

      // A tenant-admin within the same tenant can access another user's session.
      expect(admin.canAccessSession(tenantAdmin, 's1')).toBe(true)
      expect(() => admin.assertSessionAccess(tenantAdmin, 's1')).not.toThrow()

      // The tenant boundary is unconditional, even for an admin role.
      expect(admin.canAccessSession(foreignAdmin, 's1')).toBe(false)
      expect(() => admin.assertSessionAccess(foreignAdmin, 's1')).toThrow(SessionAccessDeniedError)
    })
  })
})
