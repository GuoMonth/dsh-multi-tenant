import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { InMemoryPrincipalCredentials } from '../src/credentials.ts'
import {
  ProductExperienceError,
  productExperienceError,
  toProductDiagnostic,
} from '../src/diagnostics.ts'
import { createMcpSaaSRuntime } from '../src/product.ts'
import { TenantRuntimeService } from '../src/runtime.ts'
import { MultiTenantService } from '../src/service.ts'
import { InMemoryTenantSessionStore } from '../src/store.ts'
import { readBearerToken, readCookie } from '../src/web.ts'

async function createRoot(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(InMemoryTenantSessionStore)
  await ctx.plugin(MultiTenantService)
  await ctx.plugin(TenantRuntimeService)
  return ctx
}

describe('First Product Experience facade', () => {
  it('reduces first-use composition to identity, Tenant MCP config and Principal credentials', async () => {
    const root = await createRoot()
    const runtime = await createMcpSaaSRuntime(root, {
      identity(subject: { tenant: string; user: string }) {
        if (subject.user === 'identity-error') throw new Error('raw identity secret')
        return { tenantId: subject.tenant, userId: subject.user }
      },
      mcp: {
        definitionKey: 'test-v1',
        load({ tenantId }) {
          if (tenantId === 'broken-mcp') throw new Error('https://secret.example/token=raw')
          return { servers: [] }
        },
      },
      credentials: {
        definitionKey: 'test-v1',
        create({ principal }) {
          if (principal.userId === 'credential-error') throw new Error('super-secret-token')
          return new InMemoryPrincipalCredentials({ apiToken: `${principal.tenantId}/${principal.userId}` })
        },
      },
    })

    const alice = await runtime.resolve({ tenant: 'acme', user: 'alice' })
    const aliceAgain = await runtime.resolve({ tenant: 'acme', user: 'alice' })
    const bob = await runtime.resolve({ tenant: 'acme', user: 'bob' })
    const globexAlice = await runtime.resolve({ tenant: 'globex', user: 'alice' })

    expect(alice.identity).toEqual({ tenantId: 'acme', userId: 'alice' })
    expect(aliceAgain.core).toBe(alice.core)
    expect(bob.identity).toEqual({ tenantId: 'acme', userId: 'bob' })
    expect(globexAlice.identity).toEqual({ tenantId: 'globex', userId: 'alice' })

    await expect(runtime.resolve({ tenant: 'acme', user: 'identity-error' })).rejects.toMatchObject({
      name: 'ProductExperienceError',
      code: 'IDENTITY_RESOLUTION_FAILED',
      stage: 'identity',
    })
    await expect(runtime.resolve({ tenant: 'broken-mcp', user: 'alice' })).rejects.toMatchObject({
      name: 'ProductExperienceError',
      code: 'TENANT_MCP_CONFIG_FAILED',
      stage: 'tenant-mcp-config',
    })
    await expect(runtime.resolve({ tenant: 'acme', user: 'credential-error' })).rejects.toMatchObject({
      name: 'ProductExperienceError',
      code: 'PRINCIPAL_CREDENTIAL_FAILED',
      stage: 'principal-credential',
    })

    await runtime.dispose()
    await root.fiber.dispose()
  })

  it('serializes only stable safe diagnostics and leaves raw causes server-side', () => {
    const error = productExperienceError(
      'PRINCIPAL_CREDENTIAL_FAILED',
      'principal-credential',
      'Principal credentials could not be loaded.',
      new Error('Bearer raw-secret-token'),
    )
    expect(error).toBeInstanceOf(ProductExperienceError)
    expect(toProductDiagnostic(error)).toEqual({
      code: 'PRINCIPAL_CREDENTIAL_FAILED',
      stage: 'principal-credential',
      message: 'Principal credentials could not be loaded.',
    })
    expect(JSON.stringify(toProductDiagnostic(error))).not.toContain('raw-secret-token')
  })

  it('extracts JWT/Cookie transport values without pretending to authenticate them', () => {
    expect(readBearerToken({ authorization: 'Bearer jwt-value' })).toBe('jwt-value')
    expect(readBearerToken({ authorization: 'Basic nope' })).toBeUndefined()
    expect(readCookie({ cookie: 'theme=dark; product_session=acme%3Aalice' }, 'product_session'))
      .toBe('acme:alice')
    expect(readCookie({}, 'product_session')).toBeUndefined()
  })
})
