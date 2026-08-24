import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { compileSaaSDefinition } from '../src/composition.ts'
import {
  CredentialUnavailableError,
  InMemoryPrincipalCredentials,
  definePrincipalCredentialsProvider,
  principalCredentials,
} from '../src/credentials.ts'
import { createProductIngress } from '../src/ingress.ts'
import {
  materializeRuntimeComposition,
  type ComposedPrincipal,
} from '../src/runtime-composition.ts'
import { TenantRuntimeService } from '../src/runtime.ts'
import { MultiTenantService } from '../src/service.ts'
import { InMemoryTenantSessionStore } from '../src/store.ts'
import { ValidationError } from '../src/errors.ts'

async function createRuntime(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(InMemoryTenantSessionStore)
  await ctx.plugin(MultiTenantService)
  await ctx.plugin(TenantRuntimeService)
  return ctx
}

function credentialPlan(providerId: string, revision: string) {
  return compileSaaSDefinition({
    capabilities: [{ capability: principalCredentials, required: true }],
    providers: [definePrincipalCredentialsProvider({
      id: providerId,
      definitionKey: revision,
      create({ principal }) {
        return new InMemoryPrincipalCredentials({
          erpApiToken: `${revision}:${principal.tenantId}/${principal.userId}`,
        })
      },
    })],
  })
}

type TrustedSubject = { readonly account: string; readonly organization: string }

const resolveIdentity = (subject: TrustedSubject) => ({
  tenantId: subject.organization,
  userId: subject.account,
})

async function readErpToken(principal: ComposedPrincipal): Promise<string> {
  const operation = principal.operations.start({
    requires: [principalCredentials],
    async execute({ capabilities }) {
      return capabilities.require(principalCredentials).require('erpApiToken')
    },
  })
  return operation.result
}

describe('M4 Product Ingress + Principal Credentials', () => {
  it('maps trusted subjects into canonical Principals with isolated real credentials', async () => {
    const ctx = await createRuntime()
    const composition = await materializeRuntimeComposition(ctx, credentialPlan('credentials-v1', 'v1'))
    const ingress = createProductIngress(composition, resolveIdentity)

    const acmeAlice = await ingress.resolve({ organization: 'acme', account: 'alice' })
    const acmeBob = await ingress.resolve({ organization: 'acme', account: 'bob' })
    const globexAlice = await ingress.resolve({ organization: 'globex', account: 'alice' })

    expect(acmeAlice.identity).toEqual({ tenantId: 'acme', userId: 'alice' })
    expect(acmeBob.identity).toEqual({ tenantId: 'acme', userId: 'bob' })
    expect(globexAlice.identity).toEqual({ tenantId: 'globex', userId: 'alice' })

    await expect(readErpToken(acmeAlice)).resolves.toBe('v1:acme/alice')
    await expect(readErpToken(acmeBob)).resolves.toBe('v1:acme/bob')
    await expect(readErpToken(globexAlice)).resolves.toBe('v1:globex/alice')

    const acme = composition.tenants.get('acme')
    expect(acme?.ctx.get(principalCredentials.key)).toBeUndefined()
    expect(acmeAlice.ctx.get(principalCredentials.key)).toBeDefined()
    expect(acmeBob.ctx.get(principalCredentials.key)).toBeDefined()

    const missing = acmeAlice.operations.start({
      requires: [principalCredentials],
      async execute({ capabilities }) {
        return capabilities.require(principalCredentials).require('missing')
      },
    })
    await expect(missing.result).rejects.toThrow(CredentialUnavailableError)

    await composition.dispose()
    await ctx.fiber.dispose()
  })

  it('fails invalid trusted identity before Runtime selection and replaces providers without Core changes', async () => {
    const ctx = await createRuntime()
    const first = await materializeRuntimeComposition(ctx, credentialPlan('credentials-v1', 'v1'))
    const invalidIngress = createProductIngress(first, () => ({ tenantId: 'acme', userId: ' ' }))
    await expect(invalidIngress.resolve({ organization: 'ignored', account: 'ignored' }))
      .rejects.toThrow(ValidationError)

    const ingressV1 = createProductIngress(first, resolveIdentity)
    const aliceV1 = await ingressV1.resolve({ organization: 'acme', account: 'alice' })
    await expect(readErpToken(aliceV1)).resolves.toBe('v1:acme/alice')
    await first.dispose()

    const second = await materializeRuntimeComposition(ctx, credentialPlan('credentials-v2', 'v2'))
    const ingressV2 = createProductIngress(second, resolveIdentity)
    const aliceV2 = await ingressV2.resolve({ organization: 'acme', account: 'alice' })
    await expect(readErpToken(aliceV2)).resolves.toBe('v2:acme/alice')
    expect(aliceV2.runtime).not.toBe(aliceV1.runtime)

    await second.dispose()
    await ctx.fiber.dispose()
  })
})
