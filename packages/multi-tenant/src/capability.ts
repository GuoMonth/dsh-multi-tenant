import type { Context } from '@deepseek-ai/cordis'

export type CapabilityScope = 'deployment' | 'tenant' | 'principal' | 'operation'

declare const capabilityValue: unique symbol

/**
 * Semantic capability identity used by the SaaS layer.
 *
 * The token binds a stable Cordis service key, its lifecycle/authority scope,
 * and the TypeScript value type consumers expect. It does not replace Cordis
 * service resolution or own a parallel registry.
 */
export interface CapabilityToken<T = unknown, S extends CapabilityScope = CapabilityScope> {
  readonly key: string
  readonly scope: S
  readonly [capabilityValue]?: T
}

export type CapabilityValue<C extends CapabilityToken> = C extends CapabilityToken<infer T, CapabilityScope>
  ? T
  : never

const VALID_SCOPES = new Set<CapabilityScope>(['deployment', 'tenant', 'principal', 'operation'])

function semanticKey(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError('capability key must be a non-empty trimmed string')
  }
  return value
}

export function defineCapability<T, S extends CapabilityScope>(
  key: string,
  scope: S,
): CapabilityToken<T, S> {
  semanticKey(key)
  if (!VALID_SCOPES.has(scope)) throw new TypeError(`unsupported capability scope "${String(scope)}"`)
  return Object.freeze({ key, scope }) as CapabilityToken<T, S>
}

export function assertCapabilityToken(value: unknown, label = 'capability'): asserts value is CapabilityToken {
  if (typeof value !== 'object' || value === null) throw new TypeError(`${label} must be a capability token`)
  const token = value as Partial<CapabilityToken>
  semanticKey(token.key as string)
  if (!VALID_SCOPES.has(token.scope as CapabilityScope)) {
    throw new TypeError(`${label} has unsupported scope "${String(token.scope)}"`)
  }
}

/** Thin typed facade over Cordis `ctx.provide()`. */
export function provideCapability<C extends CapabilityToken>(
  ctx: Context,
  capability: C,
  value: CapabilityValue<C>,
): void {
  ctx.provide(capability.key, value)
}

/** Thin typed facade over Cordis `ctx.get()`. */
export function getCapability<C extends CapabilityToken>(
  ctx: Context,
  capability: C,
): CapabilityValue<C> | undefined {
  return ctx.get(capability.key) as CapabilityValue<C> | undefined
}
