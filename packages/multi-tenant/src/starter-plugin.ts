import type { Context } from '@deepseek-ai/cordis'
import { apply as applyStarter, type Config } from './starter.ts'

/** Stable Cordis plugin name for the opt-in First Product Experience. */
export const name = 'multi-tenant-starter'

/**
 * The starter mounts into DSH Web and materializes canonical Tenant/Principal
 * scopes through the existing TenantRuntime service. Both are explicit Cordis
 * dependencies so Loader owns ordering and service access remains structural.
 */
export const inject = ['webServer', 'tenantRuntime']

export type { Config }

export function apply(ctx: Context, config: Config = {}): Promise<void> {
  return applyStarter(ctx, config)
}
