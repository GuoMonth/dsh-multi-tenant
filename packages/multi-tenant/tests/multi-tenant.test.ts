import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  InMemoryTenantSessionStore,
  MultiTenantError,
  MultiTenantService,
  SessionAccessDeniedError,
  SessionOwnershipConflictError,
  TenantSessionStore,
  ValidationError,
} from '../src/index.ts'
import type { AccessDecision, ClaimResult, SessionOwner, TenantPrincipal } from '../src/types.ts'

const alice: TenantPrincipal = { tenantId: 'acme', userId: 'alice' }
const bob: TenantPrincipal = { tenantId: 'acme', userId: 'bob' }
const eve: TenantPrincipal = { tenantId: 'evilcorp', userId: 'alice' }

describe('MultiTenantService', () => {
  let ctx: Context
  let multiTenant: MultiTenantService

  beforeEach(async () => {
    ctx = new Context()
    await ctx.plugin(InMemoryTenantSessionStore)
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
      expect(owner?.userId === 'alice' || owner?.userId === 'bob').toBe(true)
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

    it('does not let out-of-contract policy hints override the tenant boundary', async () => {
      await multiTenant.claimSession('s1', alice)
      const foreignWithPolicyHint = { tenantId: 'evilcorp', userId: 'root', admin: true }
      await expect(multiTenant.canAccessSession(foreignWithPolicyHint, 's1')).resolves.toBe(false)
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
  })
})

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
    await ctx.plugin(InMemoryTenantSessionStore)
    await ctx.plugin(InspectableMultiTenantService)
    const svc = ctx.multiTenant as InspectableMultiTenantService
    await svc.claimSession('s1', alice)

    await expect(svc.reason(alice, 'missing')).resolves.toEqual({ allowed: false, reason: 'UNKNOWN_SESSION' })
    await expect(svc.reason(eve, 's1')).resolves.toEqual({ allowed: false, reason: 'TENANT_MISMATCH' })
    await expect(svc.reason(bob, 's1')).resolves.toEqual({ allowed: false, reason: 'USER_MISMATCH' })
    await expect(svc.reason(alice, 's1')).resolves.toEqual({ allowed: true })
  })
})

describe('TenantSessionStore service seam', () => {
  it('consumes a swappable tenantSessionStore provider, not a fixed backend', async () => {
    class RecordingStore extends TenantSessionStore {
      readonly claims: string[] = []
      private readonly owners = new Map<string, SessionOwner>()
      constructor(ctx: Context) {
        super(ctx)
      }
      override async claim(sessionId: string, owner: SessionOwner) {
        this.claims.push(sessionId)
        if (this.owners.has(sessionId)) return 'conflict' as const
        this.owners.set(sessionId, owner)
        return 'created' as const
      }
      override async get(sessionId: string) {
        return this.owners.get(sessionId)
      }
    }

    const ctx = new Context()
    await ctx.plugin(RecordingStore)
    await ctx.plugin(MultiTenantService)

    await ctx.multiTenant.claimSession('s1', alice)
    await expect(ctx.multiTenant.getSessionOwner('s1')).resolves.toEqual({ tenantId: 'acme', userId: 'alice' })
    await expect(ctx.multiTenant.claimSession('s1', bob)).rejects.toThrow(SessionOwnershipConflictError)

    const store = ctx.tenantSessionStore as RecordingStore
    expect(store.claims).toEqual(['s1', 's1'])
  })

  it('fails closed when the store returns an invalid claim result', async () => {
    class InvalidStore extends TenantSessionStore {
      constructor(ctx: Context) {
        super(ctx)
      }
      override async claim(): Promise<ClaimResult> {
        return 'bogus' as unknown as ClaimResult
      }
      override async get(): Promise<SessionOwner | undefined> {
        return undefined
      }
    }

    const ctx = new Context()
    await ctx.plugin(InvalidStore)
    await ctx.plugin(MultiTenantService)

    await expect(ctx.multiTenant.claimSession('s1', alice)).rejects.toThrow(MultiTenantError)
  })
})
