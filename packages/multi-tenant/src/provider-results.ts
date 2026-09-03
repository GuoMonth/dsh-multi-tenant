/** Runtime validation for values crossing the host-provider boundary. */

import type {
  DshAgentSpecification,
  DshRuntimeAgentHandle,
  DshRuntimeDriver,
  RuntimePartitionLease,
  SecretLease,
  TenantAgentRuntime,
} from './protocols.ts'

function requiredObject(value: unknown, label: string): object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`)
  }
  return value
}

function requiredRevision(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${label} must be a non-empty trimmed string.`)
  }
  return value
}

function onceDisposer(owner: object, candidate: unknown, label: string): () => Promise<void> {
  if (typeof candidate !== 'function') throw new TypeError(`${label} must be a function.`)
  let disposal: Promise<void> | undefined
  return () => {
    disposal ??= Promise.resolve()
      .then(() => Reflect.apply(candidate, owner, []))
      .then(() => undefined)
    return disposal
  }
}

export function normalizeSecretLease(value: unknown): SecretLease {
  const lease = requiredObject(value, 'SecretLease')
  const source = requiredObject(Reflect.get(lease, 'values'), 'SecretLease values')
  const values: Record<string, string> = {}
  for (const key of Reflect.ownKeys(source)) {
    if (typeof key !== 'string' || key.length === 0 || key !== key.trim()) {
      throw new TypeError('SecretLease values contain an invalid key.')
    }
    const item = Reflect.get(source, key)
    if (typeof item !== 'string') throw new TypeError('SecretLease values must contain only strings.')
    values[key] = item
  }
  const signal = Reflect.get(lease, 'signal')
  if (!(signal instanceof AbortSignal)) throw new TypeError('SecretLease signal must be an AbortSignal.')
  return Object.freeze({
    revision: requiredRevision(Reflect.get(lease, 'revision'), 'SecretLease revision'),
    values: Object.freeze(values),
    signal,
    dispose: onceDisposer(lease, Reflect.get(lease, 'dispose'), 'SecretLease disposer'),
  })
}

export function normalizeRuntimePartition(value: unknown): RuntimePartitionLease {
  const lease = requiredObject(value, 'RuntimePartitionLease')
  const isolation = Reflect.get(lease, 'isolation')
  if (isolation !== 'logical' && isolation !== 'strong') {
    throw new TypeError('RuntimePartitionLease isolation must be logical or strong.')
  }
  const driver = requiredObject(Reflect.get(lease, 'driver'), 'DshRuntimeDriver')
  const create = Reflect.get(driver, 'create')
  const resume = Reflect.get(driver, 'resume')
  if (typeof create !== 'function' || typeof resume !== 'function') {
    throw new TypeError('DshRuntimeDriver must provide create and resume functions.')
  }
  const normalizedDriver: DshRuntimeDriver = Object.freeze({
    create(specification: DshAgentSpecification) {
      return Promise.resolve()
        .then(() => Reflect.apply(create, driver, [specification])) as Promise<DshRuntimeAgentHandle>
    },
    resume(specification: DshAgentSpecification) {
      return Promise.resolve()
        .then(() => Reflect.apply(resume, driver, [specification])) as Promise<DshRuntimeAgentHandle>
    },
  })
  return Object.freeze({
    isolation,
    driver: normalizedDriver,
    dispose: onceDisposer(lease, Reflect.get(lease, 'dispose'), 'RuntimePartitionLease disposer'),
  })
}

export function normalizeRuntimeHandle(value: unknown): DshRuntimeAgentHandle {
  const handle = requiredObject(value, 'DshRuntimeAgentHandle')
  const source = requiredObject(Reflect.get(handle, 'runtime'), 'TenantAgentRuntime')
  const method = (name: keyof TenantAgentRuntime): Function => {
    const candidate = Reflect.get(source, name)
    if (typeof candidate !== 'function') throw new TypeError(`TenantAgentRuntime ${name} must be a function.`)
    return candidate
  }
  const followup = method('followup')
  const steer = method('steer')
  const inject = method('inject')
  const cancel = method('cancel')
  const whenIdle = method('whenIdle')
  const executeTool = method('executeTool')
  const runtime: TenantAgentRuntime = Object.freeze({
    followup: (message: Parameters<TenantAgentRuntime['followup']>[0]) => {
      Reflect.apply(followup, source, [message])
    },
    steer: (message: Parameters<TenantAgentRuntime['steer']>[0]) => {
      Reflect.apply(steer, source, [message])
    },
    inject: (message: Parameters<TenantAgentRuntime['inject']>[0]) => {
      Reflect.apply(inject, source, [message])
    },
    cancel: (reason?: string) => {
      Reflect.apply(cancel, source, reason === undefined ? [] : [reason])
    },
    whenIdle: () => Promise.resolve().then(() => Reflect.apply(whenIdle, source, [])),
    executeTool: (
      name: string,
      args: unknown,
      options?: Parameters<TenantAgentRuntime['executeTool']>[2],
    ) => Promise.resolve().then(() => Reflect.apply(
      executeTool,
      source,
      options === undefined ? [name, args] : [name, args, options],
    )),
  })
  return Object.freeze({
    runtime,
    dispose: onceDisposer(handle, Reflect.get(handle, 'dispose'), 'DshRuntimeAgentHandle disposer'),
  })
}

/** Dispose a malformed acquired value when it exposes a usable disposer. */
export async function normalizeAcquired<T>(
  value: unknown,
  normalize: (candidate: unknown) => T,
): Promise<T> {
  try {
    return normalize(value)
  } catch (error) {
    if (typeof value === 'object' && value !== null) {
      const dispose = Reflect.get(value, 'dispose')
      if (typeof dispose === 'function') {
        await Promise.resolve().then(() => Reflect.apply(dispose, value, [])).catch(() => undefined)
      }
    }
    throw error
  }
}
