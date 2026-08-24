import type { Context } from '@deepseek-ai/cordis'
import {
  defineCapability,
  provideCapability,
  type CapabilityToken,
} from './capability.ts'
import type {
  CapabilityProviderDefinition,
  CapabilityProviderPreparation,
} from './composition.ts'
import { principalOf } from './runtime.ts'
import type { TenantPrincipal } from './types.ts'

export class CredentialUnavailableError extends Error {
  override name = 'CredentialUnavailableError'

  constructor(readonly credentialName: string) {
    super(`principal credential "${credentialName}" is unavailable`)
  }
}

export interface PrincipalCredentials {
  get(name: string): Promise<string | undefined>
  require(name: string): Promise<string>
}

export const principalCredentials = defineCapability<PrincipalCredentials, 'principal'>(
  'dsh-multi-tenant.credentials',
  'principal',
)

function validateCredentialName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.length === 0 || name !== name.trim()) {
    throw new TypeError('credential name must be a non-empty trimmed string')
  }
}

function assertPrincipalCredentials(value: unknown): asserts value is PrincipalCredentials {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('PrincipalCredentials provider must return an object')
  }
  const credentials = value as Partial<PrincipalCredentials>
  if (typeof credentials.get !== 'function' || typeof credentials.require !== 'function') {
    throw new TypeError('PrincipalCredentials provider must implement get() and require()')
  }
}

/** Minimal non-enumerating in-memory reference implementation for tests/demos. */
export class InMemoryPrincipalCredentials implements PrincipalCredentials {
  private readonly values: ReadonlyMap<string, string>

  constructor(values: Readonly<Record<string, string>>) {
    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
      throw new TypeError('in-memory credentials must be a record')
    }
    const normalized = new Map<string, string>()
    for (const [name, value] of Object.entries(values)) {
      validateCredentialName(name)
      if (typeof value !== 'string') throw new TypeError(`credential "${name}" must be a string`)
      normalized.set(name, value)
    }
    this.values = normalized
  }

  async get(name: string): Promise<string | undefined> {
    validateCredentialName(name)
    return this.values.get(name)
  }

  async require(name: string): Promise<string> {
    const value = await this.get(name)
    if (value === undefined) throw new CredentialUnavailableError(name)
    return value
  }
}

export interface PrincipalCredentialsFactoryPreparation {
  readonly ctx: Context
  readonly principal: Readonly<TenantPrincipal>
  readonly signal: AbortSignal
}

export interface PrincipalCredentialsProviderOptions {
  readonly id: string
  readonly definitionKey?: string
  readonly requires?: readonly CapabilityToken[]
  create(
    preparation: PrincipalCredentialsFactoryPreparation,
  ): PrincipalCredentials | PromiseLike<PrincipalCredentials>
}

/**
 * Adapt a Principal-scoped credentials factory into the generic composition
 * provider contract without moving identity/authentication logic into Core.
 */
export function definePrincipalCredentialsProvider(
  options: PrincipalCredentialsProviderOptions,
): CapabilityProviderDefinition<typeof principalCredentials> {
  if (typeof options?.create !== 'function') throw new TypeError('credentials provider create must be a function')

  return Object.freeze({
    id: options.id,
    capability: principalCredentials,
    ...(options.definitionKey === undefined ? {} : { definitionKey: options.definitionKey }),
    ...(options.requires === undefined ? {} : { requires: options.requires }),
    async setup({ ctx, signal }: CapabilityProviderPreparation) {
      const principal = principalOf(ctx)
      if (principal === undefined) {
        throw new TypeError('PrincipalCredentials provider must materialize inside a Principal Runtime scope')
      }
      const credentials = await options.create({ ctx, principal, signal })
      assertPrincipalCredentials(credentials)
      provideCapability(ctx, principalCredentials, credentials)
    },
  })
}
