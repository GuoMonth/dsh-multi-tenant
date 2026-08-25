import type { Context } from '@deepseek-ai/cordis'
import { apply as applyStarter, type Config } from './starter.ts'

/** Stable Cordis plugin name for the opt-in First Product Experience. */
export const name = 'multi-tenant-starter'

/**
 * Access to `ctx.webServer` is an explicit Cordis dependency. Keeping this on
 * the plugin boundary lets Loader order the starter after the DSH Web host and
 * prevents ambient service access from bypassing Cordis lifecycle semantics.
 */
export const inject = ['webServer']

export type { Config }

export function apply(ctx: Context, config: Config = {}): Promise<void> {
  return applyStarter(ctx, config)
}
