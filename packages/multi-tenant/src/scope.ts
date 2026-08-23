import type { Context, Fiber } from '@deepseek-ai/cordis'
import { ValidationError } from './errors.ts'

const RESERVED_SHARED_SERVICES = new Set([
  'events',
  'logger',
  'reflect',
  'registry',
  'tenantRuntime',
  'tenantSessionStore',
  'multiTenant',
])

export function normalizeServiceNames(names: readonly string[] | undefined): string[] {
  if (names === undefined) return []
  const unique = new Set<string>()
  for (const name of names) {
    if (typeof name !== 'string' || name.length === 0 || name !== name.trim()) {
      throw new ValidationError('isolated service names must be non-empty trimmed strings')
    }
    if (RESERVED_SHARED_SERVICES.has(name)) {
      throw new ValidationError(`service "${name}" is shared/reserved and cannot be runtime-isolated`)
    }
    unique.add(name)
  }
  return [...unique].sort()
}

export function isolatedContext(base: Context, names: readonly string[], scopeKind: string): Context {
  let current = base
  for (const name of names) {
    current = current.isolate(name, Symbol(`${scopeKind}:${name}`))
  }
  return current
}

export async function disposeFiber(fiber: Fiber): Promise<void> {
  await Promise.resolve(fiber.dispose())
  while (fiber.inertia !== undefined) await fiber.inertia
}

export async function raceAbort<T>(operation: PromiseLike<T> | T, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('operation aborted')
  }
  const aborted = Promise.withResolvers<never>()
  const listener = (): void => {
    aborted.reject(signal.reason instanceof Error ? signal.reason : new Error('operation aborted'))
  }
  signal.addEventListener('abort', listener, { once: true })
  try {
    return await Promise.race([Promise.resolve(operation), aborted.promise])
  } finally {
    signal.removeEventListener('abort', listener)
  }
}
