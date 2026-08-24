import type { TenantPrincipal } from './types.ts'
import type { ComposedPrincipal, RuntimeComposition } from './runtime-composition.ts'
import { validateTenantPrincipal } from './validation.ts'

export type ProductIdentityResolver<TrustedSubject> = (
  subject: TrustedSubject,
) => TenantPrincipal | PromiseLike<TenantPrincipal>

export interface ProductIngress<TrustedSubject> {
  resolve(subject: TrustedSubject): Promise<ComposedPrincipal>
}

/**
 * Build the trusted Product Ingress boundary.
 *
 * Authentication protocol handling is deliberately outside this function. The
 * caller supplies a subject it already trusts and a semantic resolver that maps
 * that subject to the minimal TenantPrincipal understood by the Runtime.
 */
export function createProductIngress<TrustedSubject>(
  composition: RuntimeComposition,
  resolveIdentity: ProductIdentityResolver<TrustedSubject>,
): ProductIngress<TrustedSubject> {
  if (typeof resolveIdentity !== 'function') throw new TypeError('Product identity resolver must be a function')

  return Object.freeze({
    async resolve(subject: TrustedSubject): Promise<ComposedPrincipal> {
      const resolved = await resolveIdentity(subject)
      validateTenantPrincipal(resolved)
      const principal = Object.freeze({ tenantId: resolved.tenantId, userId: resolved.userId })
      return composition.principal(principal)
    },
  })
}
