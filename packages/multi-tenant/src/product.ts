import type { Context } from '@deepseek-ai/cordis'
import { compileSaaSDefinition } from './composition.ts'
import {
  CredentialUnavailableError,
  definePrincipalCredentialsProvider,
  principalCredentials,
  type PrincipalCredentials,
} from './credentials.ts'
import {
  productExperienceError,
  ProductExperienceError,
} from './diagnostics.ts'
import {
  createMcpAgentIntegration,
  defineTenantMcpConfigProvider,
  McpIntegrationError,
  normalizeTenantMcpConfig,
  tenantMcpConfig,
  type McpAgentCreateOptions,
  type McpAgentHandle,
  type McpAgentLike,
  type McpAgentResumeOptions,
  type TenantMcpConfig,
} from './mcp.ts'
import { createProductIngress, type ProductIdentityResolver } from './ingress.ts'
import {
  materializeRuntimeComposition,
  type ComposedPrincipal,
  type RuntimeComposition,
} from './runtime-composition.ts'
import {
  SessionAccessDeniedError,
  SessionOwnershipConflictError,
} from './errors.ts'
import type { TenantPrincipal } from './types.ts'

export interface McpSaaSTenantMcpOptions {
  readonly id?: string
  readonly definitionKey?: string
  load(preparation: {
    readonly ctx: Context
    readonly tenantId: string
    readonly signal: AbortSignal
  }): TenantMcpConfig | PromiseLike<TenantMcpConfig>
}

export interface McpSaaSCredentialsOptions {
  readonly id?: string
  readonly definitionKey?: string
  create(preparation: {
    readonly ctx: Context
    readonly principal: Readonly<TenantPrincipal>
    readonly signal: AbortSignal
  }): PrincipalCredentials | PromiseLike<PrincipalCredentials>
}

export interface McpSaaSRuntimeOptions<TrustedSubject> {
  /** Map an already-authenticated product subject to the Runtime identity. */
  readonly identity: ProductIdentityResolver<TrustedSubject>
  /** Product-owned Tenant MCP configuration loader. */
  readonly mcp: McpSaaSTenantMcpOptions
  /** Product-owned Principal credential loader. */
  readonly credentials: McpSaaSCredentialsOptions
}

export interface McpSaaSPrincipal {
  readonly identity: Readonly<TenantPrincipal>
  /** Advanced escape hatch; normal product code should use create/resume below. */
  readonly core: ComposedPrincipal
  create<A extends McpAgentLike = McpAgentLike>(options: McpAgentCreateOptions): Promise<McpAgentHandle<A>>
  resume<A extends McpAgentLike = McpAgentLike>(options: McpAgentResumeOptions): Promise<McpAgentHandle<A>>
}

export interface McpSaaSRuntime<TrustedSubject> {
  /** Advanced escape hatch to the exact bound Core composition. */
  readonly composition: RuntimeComposition
  resolve(subject: TrustedSubject): Promise<McpSaaSPrincipal>
  create<A extends McpAgentLike = McpAgentLike>(
    subject: TrustedSubject,
    options: McpAgentCreateOptions,
  ): Promise<McpAgentHandle<A>>
  resume<A extends McpAgentLike = McpAgentLike>(
    subject: TrustedSubject,
    options: McpAgentResumeOptions,
  ): Promise<McpAgentHandle<A>>
  dispose(): Promise<void>
}

function assertCredentialsContract(value: unknown): asserts value is PrincipalCredentials {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Principal credentials factory must return an object')
  }
  const credentials = value as Partial<PrincipalCredentials>
  if (typeof credentials.get !== 'function' || typeof credentials.require !== 'function') {
    throw new TypeError('Principal credentials must implement get() and require()')
  }
}

function classifyLaunchFailure(error: unknown): ProductExperienceError {
  if (error instanceof ProductExperienceError) return error
  if (error instanceof SessionAccessDeniedError) {
    return productExperienceError(
      'SESSION_ACCESS_DENIED',
      'session-ownership',
      'This Session belongs to another Principal.',
      error,
    )
  }
  if (error instanceof SessionOwnershipConflictError) {
    return productExperienceError(
      'SESSION_OWNERSHIP_CONFLICT',
      'session-ownership',
      'This Session id is already owned by another Principal.',
      error,
    )
  }
  if (error instanceof CredentialUnavailableError) {
    return productExperienceError(
      'PRINCIPAL_CREDENTIAL_FAILED',
      'principal-credential',
      'A required Principal credential is unavailable.',
      error,
    )
  }
  if (error instanceof McpIntegrationError) {
    return productExperienceError(
      'MCP_SETUP_FAILED',
      'mcp-setup',
      'The DSH MCP integration could not start for this Principal.',
      error,
    )
  }
  return productExperienceError(
    'MCP_SETUP_FAILED',
    'mcp-setup',
    'The Principal Agent could not complete MCP setup.',
    error,
  )
}

function wrapPrincipal(principal: ComposedPrincipal): McpSaaSPrincipal {
  const agents = createMcpAgentIntegration(principal)
  return Object.freeze({
    identity: principal.identity,
    core: principal,
    async create<A extends McpAgentLike = McpAgentLike>(options: McpAgentCreateOptions) {
      try {
        return await agents.create<A>(options)
      } catch (error) {
        throw classifyLaunchFailure(error)
      }
    },
    async resume<A extends McpAgentLike = McpAgentLike>(options: McpAgentResumeOptions) {
      try {
        return await agents.resume<A>(options)
      } catch (error) {
        throw classifyLaunchFailure(error)
      }
    },
  })
}

/**
 * Materialize the current opinionated product path without exposing the Core
 * composition graph to first-time product code.
 *
 * This is deliberately MCP-specific. It is a facade over the existing Core,
 * not a second Runtime or a speculative universal SaaS abstraction.
 */
export async function createMcpSaaSRuntime<TrustedSubject>(
  ctx: Context,
  options: McpSaaSRuntimeOptions<TrustedSubject>,
): Promise<McpSaaSRuntime<TrustedSubject>> {
  if (typeof options?.identity !== 'function') throw new TypeError('product identity resolver must be a function')
  if (typeof options?.mcp?.load !== 'function') throw new TypeError('Tenant MCP loader must be a function')
  if (typeof options?.credentials?.create !== 'function') throw new TypeError('Principal credentials factory must be a function')

  const plan = compileSaaSDefinition({
    capabilities: [
      { capability: tenantMcpConfig, required: true },
      { capability: principalCredentials, required: true },
    ],
    providers: [
      defineTenantMcpConfigProvider({
        id: options.mcp.id ?? 'product-tenant-mcp',
        ...(options.mcp.definitionKey === undefined ? {} : { definitionKey: options.mcp.definitionKey }),
        async load(preparation) {
          try {
            return normalizeTenantMcpConfig(await options.mcp.load(preparation))
          } catch (error) {
            throw productExperienceError(
              'TENANT_MCP_CONFIG_FAILED',
              'tenant-mcp-config',
              'Tenant MCP configuration could not be loaded.',
              error,
            )
          }
        },
      }),
      definePrincipalCredentialsProvider({
        id: options.credentials.id ?? 'product-principal-credentials',
        ...(options.credentials.definitionKey === undefined ? {} : { definitionKey: options.credentials.definitionKey }),
        async create(preparation) {
          try {
            const credentials = await options.credentials.create(preparation)
            assertCredentialsContract(credentials)
            return credentials
          } catch (error) {
            throw productExperienceError(
              'PRINCIPAL_CREDENTIAL_FAILED',
              'principal-credential',
              'Principal credentials could not be loaded.',
              error,
            )
          }
        },
      }),
    ],
  })

  const composition = await materializeRuntimeComposition(ctx, plan)
  const ingress = createProductIngress<TrustedSubject>(composition, async (subject) => {
    try {
      return await options.identity(subject)
    } catch (error) {
      throw productExperienceError(
        'IDENTITY_RESOLUTION_FAILED',
        'identity',
        'The trusted product subject could not be mapped to a Tenant/Principal.',
        error,
      )
    }
  })

  const resolve = async (subject: TrustedSubject): Promise<McpSaaSPrincipal> => {
    try {
      return wrapPrincipal(await ingress.resolve(subject))
    } catch (error) {
      if (error instanceof ProductExperienceError) throw error
      throw productExperienceError(
        'IDENTITY_RESOLUTION_FAILED',
        'identity',
        'The product identity could not be materialized as a Principal.',
        error,
      )
    }
  }

  return Object.freeze({
    composition,
    resolve,
    async create<A extends McpAgentLike = McpAgentLike>(subject: TrustedSubject, createOptions: McpAgentCreateOptions) {
      const principal = await resolve(subject)
      return principal.create<A>(createOptions)
    },
    async resume<A extends McpAgentLike = McpAgentLike>(subject: TrustedSubject, resumeOptions: McpAgentResumeOptions) {
      const principal = await resolve(subject)
      return principal.resume<A>(resumeOptions)
    },
    dispose: () => composition.dispose(),
  })
}
