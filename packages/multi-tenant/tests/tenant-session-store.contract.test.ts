import { describe, expect, it } from 'vitest'
import { InMemoryTenantSessionStore } from '../src/index.ts'
import { assertTenantSessionStoreContract } from '../src/testing.ts'

describe('InMemoryTenantSessionStore contract', () => {
  it('satisfies the TenantSessionStore contract', async () => {
    await expect(
      assertTenantSessionStoreContract(async (ctx) => {
        await ctx.plugin(InMemoryTenantSessionStore)
        return ctx.tenantSessionStore
      }),
    ).resolves.toBeUndefined()
  })
})
