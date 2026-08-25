import type { Context } from '@deepseek-ai/cordis'
import { apply as applyStarter, type Config } from './starter.ts'

/** Stable Cordis plugin name for the opt-in First Product Experience. */
export const name = 'multi-tenant-starter'

/**
 * Every service the runnable proof depends on is declared at the Cordis plugin
 * boundary. Loader therefore owns ordering, and the demo cannot silently boot
 * against a partial/non-Web DSH composition.
 */
export const inject = [
  'webServer',
  'tenantRuntime',
  'multiTenant',
  'agents',
  'tools',
  'sessionPersistence',
]

export type { Config }

export function apply(ctx: Context, config: Config = {}): Promise<void> {
  return applyStarter(ctx, config)
}
