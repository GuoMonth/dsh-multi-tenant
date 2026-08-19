import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-multi-tenant-runtime-fixture'
export const inject = ['multiTenant']
export let completed: Promise<void> = Promise.resolve()

export function apply(ctx: Context): void {
  completed = (async () => {
    const alice = { tenantId: 'acme', userId: 'alice' }
    const eve = { tenantId: 'evilcorp', userId: 'alice' }

    await ctx.multiTenant.claimSession('s1', alice)
    const owner = await ctx.multiTenant.getSessionOwner('s1')
    const sameAllowed = await ctx.multiTenant.canAccessSession(alice, 's1')
    const crossTenantAllowed = await ctx.multiTenant.canAccessSession(eve, 's1')

    let denialName: string | undefined
    let denialMessage: string | undefined
    try {
      await ctx.multiTenant.assertSessionAccess(eve, 's1')
    } catch (error) {
      denialName = (error as Error).constructor.name
      denialMessage = (error as Error).message
    }

    console.log(JSON.stringify({ owner, sameAllowed, crossTenantAllowed, denialName, denialMessage }))
  })()
}
