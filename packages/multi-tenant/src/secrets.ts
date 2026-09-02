/** Reference SecretProvider implementations; secret values are never persisted. */

import type { Context } from '@deepseek-ai/cordis'
import { CapabilityUnavailableError } from './errors.ts'
import { SecretProvider, type SecretLease } from './protocols.ts'
import type { PrincipalContext } from './types.ts'

export function emptySecretLease(): SecretLease {
  const signal = new AbortController().signal
  return Object.freeze({
    revision: 'none-v1',
    values: Object.freeze({}),
    signal,
    dispose() {},
  })
}

export class UnavailableSecretProvider extends SecretProvider {
  override async acquire(): Promise<SecretLease> {
    throw new CapabilityUnavailableError('This deployment has no SecretProvider.')
  }
}

export interface StaticSecretProviderConfig {
  readonly revision?: string
  readonly values?: Readonly<Record<string, string>>
}

/** Development provider. Values remain process-local and are copied into each lease. */
export class StaticSecretProvider extends SecretProvider {
  private readonly revision: string
  private readonly values: Readonly<Record<string, string>>

  constructor(ctx: Context, config: StaticSecretProviderConfig = {}) {
    super(ctx)
    this.revision = config.revision ?? 'static-v1'
    this.values = Object.freeze({ ...(config.values ?? {}) })
  }

  override async acquire(_principal: PrincipalContext, names: readonly string[]): Promise<SecretLease> {
    const values: Record<string, string> = {}
    for (const name of names) {
      const value = this.values[name]
      if (value === undefined) throw new CapabilityUnavailableError(`Required secret "${name}" is unavailable.`)
      values[name] = value
    }
    return Object.freeze({
      revision: this.revision,
      values: Object.freeze(values),
      signal: new AbortController().signal,
      dispose() {},
    })
  }
}
