/** Opt-in local Web proof. Never use its demo cookies as production authentication. */

import type { Context } from '@deepseek-ai/cordis'
import { createPrincipalContext } from './types.ts'
import { mountMultiTenantWeb, readCookie } from './web.ts'

export const name = 'multi-tenant-starter'
export const inject = ['webServer', 'multiTenant']

export interface Config {
  readonly enabled?: boolean
  readonly basePath?: string
  readonly cookieName?: string
}

export function apply(ctx: Context, config: Config = {}): void {
  if (config.enabled !== true) return
  const cookieName = config.cookieName ?? 'dsh_mt_demo'
  const identities = new Map([
    ['acme-alice', createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })],
    ['acme-bob', createPrincipalContext({ tenantId: 'acme', principalId: 'bob' })],
    ['globex-alice', createPrincipalContext({ tenantId: 'globex', principalId: 'alice' })],
  ])
  const handle = mountMultiTenantWeb(ctx, ctx.multiTenant, {
    ...(config.basePath === undefined ? {} : { basePath: config.basePath }),
    principalProvider: {
      authenticate(request) {
        const token = readCookie(request.headers, cookieName)
        return token === undefined ? undefined : identities.get(token)
      },
    },
  })
  ctx.effect(() => () => handle.dispose(), 'dsh-multi-tenant: unmount starter Web routes')
}

export default apply
