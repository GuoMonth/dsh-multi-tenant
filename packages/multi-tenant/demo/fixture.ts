import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-multi-tenant-runtime-fixture'
export const inject = ['multiTenant', 'tenantRuntime']
export let completed: Promise<void> = Promise.resolve()

function marker(ctx: Context, config: { name: string; value: string }): void {
  ctx.provide(config.name, config.value)
}

export function apply(ctx: Context): void {
  completed = (async () => {
    const alice = { tenantId: 'acme', userId: 'alice' }
    const eve = { tenantId: 'evilcorp', userId: 'alice' }

    await ctx.multiTenant.claimSession('s1', alice)
    const owner = await ctx.multiTenant.getSessionOwner('s1')
    const sameAllowed = await ctx.multiTenant.canAccessSession(alice, 's1')
    const crossTenantAllowed = await ctx.multiTenant.canAccessSession(eve, 's1')

    const acme = ctx.tenantRuntime.createTenant('acme', { isolateServices: ['tenantAuth'] })
    const evilcorp = ctx.tenantRuntime.createTenant('evilcorp', { isolateServices: ['tenantAuth'] })
    await acme.ctx.plugin(marker, { name: 'tenantAuth', value: 'auth-acme' })
    await evilcorp.ctx.plugin(marker, { name: 'tenantAuth', value: 'auth-evilcorp' })
    const acmeAuth = acme.ctx.get('tenantAuth')
    const evilcorpAuth = evilcorp.ctx.get('tenantAuth')
    const rootAuth = ctx.get('tenantAuth')

    let denialName: string | undefined
    let denialMessage: string | undefined
    try {
      await ctx.multiTenant.assertSessionAccess(eve, 's1')
    } catch (error) {
      denialName = (error as Error).constructor.name
      denialMessage = (error as Error).message
    }

    console.log(JSON.stringify({
      owner,
      sameAllowed,
      crossTenantAllowed,
      denialName,
      denialMessage,
      acmeAuth,
      evilcorpAuth,
      rootAuth,
    }))
  })()
}
