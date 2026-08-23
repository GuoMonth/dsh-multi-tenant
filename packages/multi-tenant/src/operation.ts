import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { TenantPrincipal } from './types.ts'
import { disposeFiber, isolatedContext, normalizeServiceNames, raceAbort } from './scope.ts'

export type PrincipalOperationState =
  | 'preparing'
  | 'active'
  | 'cancelling'
  | 'failed'
  | 'disposing'
  | 'disposed'

export interface PrincipalOperationIdentity {
  readonly operationId: string
  readonly principal: Readonly<TenantPrincipal>
}

export interface OperationScopeSetupCommit {
  commit(): void
}

export interface OperationScopePreparation {
  readonly ctx: Context
  readonly signal: AbortSignal
  readonly identity: Readonly<PrincipalOperationIdentity>
}

export type OperationScopeSetup = (
  preparation: OperationScopePreparation,
) => OperationScopeSetupCommit | PromiseLike<OperationScopeSetupCommit | void> | void

export interface OperationScopeDefinition {
  readonly isolateServices?: readonly string[]
  readonly setup?: OperationScopeSetup
}

export interface OperationCapabilitySnapshot {
  readonly keys: readonly string[]
  has(name: string): boolean
  get<T = unknown>(name: string): T | undefined
  require<T = unknown>(name: string): T
}

export interface PrincipalOperationExecution {
  readonly ctx: Context
  readonly signal: AbortSignal
  readonly identity: Readonly<PrincipalOperationIdentity>
  readonly capabilities: OperationCapabilitySnapshot
}

export interface PrincipalOperationDefinition<T> extends OperationScopeDefinition {
  readonly requires?: readonly string[]
  execute(execution: PrincipalOperationExecution): T | PromiseLike<T>
}

export interface PrincipalOperation<T = unknown> {
  readonly identity: Readonly<PrincipalOperationIdentity>
  readonly state: PrincipalOperationState
  readonly signal: AbortSignal
  readonly result: Promise<T>
  cancel(reason?: unknown): Promise<void>
  dispose(): Promise<void>
}

export interface PrincipalOperationRegistry {
  readonly accepting: boolean
  readonly size: number
  start<T>(definition: PrincipalOperationDefinition<T>): PrincipalOperation<T>
}

export class PrincipalOperationError extends Error {
  override name = 'PrincipalOperationError'
}

export class OperationRegistryClosedError extends PrincipalOperationError {
  override name = 'OperationRegistryClosedError'
}

export class OperationDependencyUnavailableError extends PrincipalOperationError {
  override name = 'OperationDependencyUnavailableError'

  constructor(readonly capability: string) {
    super(`required operation capability "${capability}" is unavailable`)
  }
}

export class OperationCancelledError extends PrincipalOperationError {
  override name = 'OperationCancelledError'

  constructor(message = 'operation cancelled') {
    super(message)
  }
}

function operationOwner(): void {}

function normalizeRequiredCapabilities(names: readonly string[] | undefined): string[] {
  if (names === undefined) return []
  const unique = new Set<string>()
  for (const name of names) {
    if (typeof name !== 'string' || name.length === 0 || name !== name.trim()) {
      throw new TypeError('operation capability names must be non-empty trimmed strings')
    }
    unique.add(name)
  }
  return [...unique].sort()
}

class ImmutableCapabilitySnapshot implements OperationCapabilitySnapshot {
  readonly keys: readonly string[]

  constructor(private readonly values: ReadonlyMap<string, unknown>) {
    this.keys = Object.freeze([...values.keys()])
    Object.freeze(this)
  }

  has(name: string): boolean {
    return this.values.has(name)
  }

  get<T = unknown>(name: string): T | undefined {
    return this.values.get(name) as T | undefined
  }

  require<T = unknown>(name: string): T {
    if (!this.values.has(name)) throw new OperationDependencyUnavailableError(name)
    return this.values.get(name) as T
  }
}

function captureCapabilities(ctx: Context, names: readonly string[]): OperationCapabilitySnapshot {
  const values = new Map<string, unknown>()
  for (const name of names) {
    const value = ctx.get(name)
    if (value === undefined) throw new OperationDependencyUnavailableError(name)
    values.set(name, value)
  }
  return new ImmutableCapabilitySnapshot(values)
}

function cancellationReason(reason: unknown): Error {
  if (reason instanceof Error) return reason
  if (reason === undefined) return new OperationCancelledError()
  return new OperationCancelledError(String(reason))
}

class PrincipalOperationRegistryImpl implements PrincipalOperationRegistry {
  private readonly operations = new Set<PrincipalOperation<unknown>>()
  private counter = 0
  private open = true
  private closing: Promise<void> | undefined

  constructor(
    private readonly parentCtx: Context,
    private readonly principal: Readonly<TenantPrincipal>,
  ) {}

  get accepting(): boolean {
    return this.open
  }

  get size(): number {
    return this.operations.size
  }

  start<T>(definition: PrincipalOperationDefinition<T>): PrincipalOperation<T> {
    if (!this.open) throw new OperationRegistryClosedError('principal operation registry is closing')
    if (typeof definition?.execute !== 'function') throw new TypeError('operation execute must be a function')

    const isolateServices = normalizeServiceNames(definition.isolateServices)
    const requires = normalizeRequiredCapabilities(definition.requires)
    const identity = Object.freeze({
      operationId: `operation-${++this.counter}`,
      principal: this.principal,
    })
    const abort = new AbortController()
    let state: PrincipalOperationState = 'preparing'
    let ownerFiber: Fiber | undefined
    let cleanup: Promise<void> | undefined
    let operation!: PrincipalOperation<T>

    const cleanupOwner = (): Promise<void> => {
      if (cleanup !== undefined) return cleanup
      cleanup = (async () => {
        if (state !== 'cancelling' && state !== 'failed') state = 'disposing'
        try {
          if (ownerFiber !== undefined) await disposeFiber(ownerFiber)
        } finally {
          state = 'disposed'
          this.operations.delete(operation as PrincipalOperation<unknown>)
        }
      })()
      return cleanup
    }

    const result = (async (): Promise<T> => {
      try {
        const base = isolatedContext(this.parentCtx, isolateServices, `operation:${identity.operationId}`)
        ownerFiber = base.plugin(operationOwner)
        await ownerFiber.await()
        const operationCtx = ownerFiber.ctx

        operationCtx.effect(() => () => {
          if (!abort.signal.aborted) {
            abort.abort(new OperationCancelledError('operation owner disposed'))
          }
        }, 'principalOperation.abortOnOwnerDispose()')

        if (definition.setup !== undefined) {
          const prepared = await raceAbort(
            definition.setup({ ctx: operationCtx, signal: abort.signal, identity }),
            abort.signal,
          )
          ownerFiber.assertActive()
          if (prepared !== undefined) {
            if (typeof prepared !== 'object' || prepared === null || typeof prepared.commit !== 'function') {
              throw new TypeError('operation setup must return void or { commit(): void }')
            }
            prepared.commit()
          }
        }

        ownerFiber.assertActive()
        if (abort.signal.aborted) throw cancellationReason(abort.signal.reason)
        const capabilities = captureCapabilities(operationCtx, requires)
        if (abort.signal.aborted) throw cancellationReason(abort.signal.reason)

        state = 'active'
        return await definition.execute({
          ctx: operationCtx,
          signal: abort.signal,
          identity,
          capabilities,
        })
      } catch (error) {
        if (abort.signal.aborted) {
          state = 'cancelling'
          if (error === abort.signal.reason) throw error
          throw cancellationReason(abort.signal.reason)
        }
        state = 'failed'
        throw error
      } finally {
        await cleanupOwner()
      }
    })()

    // Observe rejection even when a caller creates a handle before attaching to result.
    void result.catch(() => {})

    const settle = async (): Promise<void> => {
      try {
        await result
      } catch {
        // `result` is the causal error channel. Cancellation/disposal only joins quiescence.
      }
    }

    const cancel = async (reason?: unknown): Promise<void> => {
      if (state === 'disposed') return cleanup
      if (!abort.signal.aborted) abort.abort(cancellationReason(reason))
      if (state !== 'failed') state = 'cancelling'
      await settle()
    }

    operation = {
      identity,
      get state() { return state },
      signal: abort.signal,
      result,
      cancel,
      dispose: () => cancel(new OperationCancelledError('operation disposed')),
    }

    this.operations.add(operation as PrincipalOperation<unknown>)
    return operation
  }

  disposeAll(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.open = false
    const reason = new OperationRegistryClosedError('principal operation registry is closing')
    const operations = [...this.operations]
    this.closing = (async () => {
      await Promise.allSettled(operations.map(operation => operation.cancel(reason)))
      this.operations.clear()
    })()
    return this.closing
  }
}

export function createPrincipalOperationRegistry(
  ctx: Context,
  principal: Readonly<TenantPrincipal>,
): PrincipalOperationRegistry & { disposeAll(): Promise<void> } {
  return new PrincipalOperationRegistryImpl(ctx, principal)
}
