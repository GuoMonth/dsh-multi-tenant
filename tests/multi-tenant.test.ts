import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MultiTenantService,
  SessionAccessDeniedError,
  SessionOwnershipConflictError,
  ValidationError,
} from '../src/index.ts'
import type { AccessDecision, SessionOwner, TenantPrincipal } from '../src/types.ts'

const alice: TenantPrincipal = { tenantId: 'acme', userId: 'alice', roles: ['member'] }
const bob: TenantPrincipal = { tenantId: 'acme', userId: 'bob', roles: ['member'] }
const eve: TenantPrincipal = { tenantId: 'evilcorp', userId: 'alice', roles: ['member'] }
const acmeAdmin: TenantPrincipal = { tenantId: 'acme', userId: 'root', roles: ['tenant-admin'] }
const foreignAdmin: TenantPrincipal = { tenantId: 'evilcorp', userId: 'root', roles: ['tenant-admin', 'platform-admin'] }

describe('MultiTenantService', () => {
  let ctx: Context
  let multiTenant: MultiTenantService

  beforeEach(async () => {
    ctx = new Context()
    await ctx.plugin(MultiTenantService)
    multiTenant = ctx.multiTenant
  })

  describe('ownership claim', () => {
    it('succeeds on the first claim', async () => {
      await expect(multiTenant.claimSession('s1', alice)).resolves.toBeUndefined()
      await expect(multiTenant.getSessionOwner('s1')).resolves.toEqual({ tenantId: 'acme', userId: 'alice' })
    })

    it('is idempotent for the same owner', async () => {
      await multiTenant.claimSession('s1', alice)
      await expect(multiTenant.claimSession('s1', alice)).resolves.toBeUndefined()
      await expect(multiTenant.getSessionOwner('s1')).resolves.toEqual({ tenantId: 'acme', userId: 'alice' })
    })

    it('conflicts for a different user in the same tenant', async () => {
      await multiTenant.claimSession('s1', alice)
      await expect(multiTenant.claimSession('s1', bob)).rejects.toThrow(SessionOwnershipConflictError)
    })

    it('conflicts for a different tenant', async () => {
      await multiTenant.claimSession('s1', alice)
      await expect(multiTenant.claimSession('s1', eve)).rejects.toThrow(SessionOwnershipConflictError)
    })

    it('never overwrites the original owner on conflict', async () => {
      await multiTenant.claimSession('s1', alice)
      await expect(multiTenant.claimSession('s1', eve)).rejects.toThrow(SessionOwnershipConflictError)
      await expect(multiTenant.getSessionOwner('s1')).resolves.toEqual({ tenantId: 'acme', userId: 'alice' })
    })

    it('resolves a concurrent double-claim to exactly one owner', async () => {
      const results = await Promise.allSettled([
        multiTenant.claimSession('s1', alice),
        multiTenant.claimSession('s1', bob),
      ])
      const fulfilled = results.filter((r): r is PromiseFulfilledResult<void> => r.status === 'fulfilled')
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0]?.reason).toBeInstanceOf(SessionOwnershipConflictError)
      const owner = await multiTenant.getSessionOwner('s1')
      expect(owner).not.toBeUndefined()
      const winnerIsAlice = owner?.userId === 'alice'
      const winnerIsBob = owner?.userId === 'bob'
      expect(winnerIsAlice || winnerIsBob).toBe(true)
    })
  })

  describe('authorization', () => {
    it('allows the same tenant + same owner', async () => {
      await multiTenant.claimSession('s1', alice)
      await expect(multiTenant.canAccessSession(alice, 's1')).resolves.toBe(true)
      await expect(multiTenant.assertSessionAccess(alice, 's1')).resolves.toBeUndefined()
    })

    it('denies a different tenant', async () => {
      await multiTenant.claimSession('s1', alice)
      await expect(multiTenant.canAccessSession(eve, 's1')).resolves.toBe(false)
      await expect(multiTenant.assertSessionAccess(eve, 's1')).rejects.toThrow(SessionAccessDeniedError)
    })

    it('denies a different user in the same tenant', async () => {
      await multiTenant.claimSession('s1', alice)
      await expect(multiTenant.canAccessSession(bob, 's1')).resolves.toBe(false)
      await expect(multiTenant.assertSessionAccess(bob, 's1')).rejects.toThrow(SessionAccessDeniedError)
    })

    it('denies an unknown session (fail closed)', async () => {
      await expect(multiTenant.getSessionOwner('missing')).resolves.toBeUndefined()
      await expect(multiTenant.canAccessSession(alice, 'missing')).resolves.toBe(false)
      await expect(multiTenant.assertSessionAccess(alice, 'missing')).rejects.toThrow(SessionAccessDeniedError)
    })

    it('does not let any role cross the tenant boundary', async () => {
      await multiTenant.claimSession('s1', alice)
      // tenant-admin in a DIFFERENT tenant → denied (boundary is unconditional)
      await expect(multiTenant.canAccessSession(foreignAdmin, 's1')).resolves.toBe(false)
      // tenant-admin in the SAME tenant but different user → still denied (ownership only, no RBAC yet)
      await expect(multiTenant.canAccessSession(acmeAdmin, 's1')).resolves.toBe(false)
    })

    it('surfaces a uniform error for unknown vs foreign sessions', async () => {
      await multiTenant.claimSession('s1', alice)
      const unknown = await captureDenial(() => multiTenant.assertSessionAccess(alice, 'missing'))
      const foreign = await captureDenial(() => multiTenant.assertSessionAccess(eve, 's1'))
      expect(unknown).toBeInstanceOf(SessionAccessDeniedError)
      expect(foreign).toBeInstanceOf(SessionAccessDeniedError)
      expect(unknown?.message).toBe(foreign?.message)
      expect(unknown?.message).toBe('Access to session denied.')
    })

    it('does not leak owner identity in the public error', async () => {
      await multiTenant.claimSession('s1', alice)
      const error = await captureDenial(() => multiTenant.assertSessionAccess(eve, 's1'))
      const message = error?.message ?? ''
      expect(message).not.toContain('acme')
      expect(message).not.toContain('evilcorp')
      expect(message).not.toContain('alice')
      expect(message).not.toContain('bob')
      expect(message).toContain('denied')
    })
  })

  describe('release', () => {
    it('lets the owner release', async () => {
      await multiTenant.claimSession('s1', alice)
      await expect(multiTenant.releaseSession('s1', alice)).resolves.toBeUndefined()
      await expect(multiTenant.getSessionOwner('s1')).resolves.toBeUndefined()
    })

    it('denies release by a different user', async () => {
      await multiTenant.claimSession('s1', alice)
      await expect(multiTenant.releaseSession('s1', bob)).rejects.toThrow(SessionAccessDeniedError)
      await expect(multiTenant.getSessionOwner('s1')).resolves.toEqual({ tenantId: 'acme', userId: 'alice' })
    })

    it('denies release by a different tenant', async () => {
      await multiTenant.claimSession('s1', alice)
      await expect(multiTenant.releaseSession('s1', eve)).rejects.toThrow(SessionAccessDeniedError)
      await expect(multiTenant.getSessionOwner('s1')).resolves.toEqual({ tenantId: 'acme', userId: 'alice' })
    })

    it('denies release of an unknown session', async () => {
      await expect(multiTenant.releaseSession('missing', alice)).rejects.toThrow(SessionAccessDeniedError)
    })
  })

  describe('runtime validation', () => {
    it('rejects an empty sessionId', async () => {
      await expect(multiTenant.claimSession('', alice)).rejects.toThrow(ValidationError)
    })

    it('rejects an empty tenantId', async () => {
      await expect(multiTenant.claimSession('s1', { ...alice, tenantId: '' })).rejects.toThrow(ValidationError)
    })

    it('rejects a whitespace-only tenantId', async () => {
      await expect(multiTenant.claimSession('s1', { ...alice, tenantId: '   ' })).rejects.toThrow(ValidationError)
    })

    it('rejects an empty userId', async () => {
      await expect(multiTenant.claimSession('s1', { ...alice, userId: '' })).rejects.toThrow(ValidationError)
    })

    it('rejects an invalid role entry', async () => {
      await expect(
        multiTenant.claimSession('s1', { ...alice, roles: ['member', ''] }),
      ).rejects.toThrow(ValidationError)
    })
  })
})

/** A test subclass that exposes the internal denial reason for assertions. */
class InspectableMultiTenantService extends MultiTenantService {
  async reason(principal: TenantPrincipal, sessionId: string): Promise<AccessDecision> {
    return this.evaluateAccess(principal, sessionId)
  }
}

async function captureDenial(fn: () => Promise<unknown>): Promise<Error | undefined> {
  try {
    await fn()
  } catch (error) {
    return error as Error
  }
  return undefined
}

describe('internal access decision (diagnostic reason)', () => {
  it('classifies unknown / tenant-mismatch / user-mismatch distinctly', async () => {
    const ctx = new Context()
    await ctx.plugin(InspectableMultiTenantService)
    const svc = ctx.multiTenant as InspectableMultiTenantService
    await svc.claimSession('s1', alice)

    await expect(svc.reason(alice, 'missing')).resolves.toEqual({ allowed: false, reason: 'UNKNOWN_SESSION' })
    await expect(svc.reason(eve, 's1')).resolves.toEqual({ allowed: false, reason: 'TENANT_MISMATCH' })
    await expect(svc.reason(bob, 's1')).resolves.toEqual({ allowed: false, reason: 'USER_MISMATCH' })
    await expect(svc.reason(alice, 's1')).resolves.toEqual({ allowed: true })
  })
})

describe('TenantSessionStore seam', () => {
  it('accepts an injected store and does not assume Map backing', async () => {
    const owners = new Map<string, SessionOwner>()
    const store = {
      async claim(sessionId: string, owner: SessionOwner) {
        if (owners.has(sessionId)) return 'conflict' as const
        owners.set(sessionId, owner)
        return 'created' as const
      },
      async get(sessionId: string) {
        return owners.get(sessionId)
      },
      async release(sessionId: string) {
        owners.delete(sessionId)
      },
    }
    const ctx = new Context()
    const service = new MultiTenantService(ctx, store)
    await service.claimSession('s1', alice)
    await expect(service.getSessionOwner('s1')).resolves.toEqual({ tenantId: 'acme', userId: 'alice' })
    await expect(service.claimSession('s1', bob)).rejects.toThrow(SessionOwnershipConflictError)
  })
})
