/** Optional native FS adapter; the host must explicitly supply the authorized execution-world scope. */
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import { DeliveryNotFoundError, ValidationError } from './errors.ts'
import type { FileReadRequest, FileReadLease } from './delivery-types.ts'
export type { FileReadRequest, FileReadLease, DeliveryFile, DeliverySummary } from './delivery-types.ts'

export interface NativeDeliveryScope {
  readonly fs: FileSystem
  /** Trusted Principal workspace, never a request field or a Session-controlled authorization root. */
  readonly workspace: string
  readonly signal?: AbortSignal
  dispose(): void | PromiseLike<void>
}

/** Bounded native byte read; canonical containment and symlink policy stay in the supplied FS backend. */
export async function openNativeDelivery(request: FileReadRequest, scope: NativeDeliveryScope): Promise<FileReadLease> {
  const signal = AbortSignal.any([request.signal, ...(scope.signal ? [scope.signal] : [])])
  let disposed: Promise<void> | undefined
  const dispose = () => disposed ??= Promise.resolve().then(() => scope.dispose())
  try {
    signal.throwIfAborted()
    const { fs } = scope
    const cwd = request.header.cwd
    if (!cwd) throw new DeliveryNotFoundError()
    const root = await fs.resolve(scope.workspace, { signal })
    const working = await fs.resolve(cwd, { signal })
    if (!fs.contains(root, working)) throw new DeliveryNotFoundError()
    const entry = await fs.lstat(request.path, { cwd }, signal)
    if (!entry || entry.type !== 'file') throw new DeliveryNotFoundError()
    const target = await fs.resolve(request.path, { cwd, signal })
    if (!fs.contains(root, target)) throw new DeliveryNotFoundError()
    const info = await fs.stat(target, signal)
    if (!info || info.type !== 'file') throw new DeliveryNotFoundError()
    if (info.size !== undefined && info.size > request.maxBytes) throw new ValidationError('delivery exceeds the configured byte limit')
    const bytes = await fs.readBytes(target, signal, request.maxBytes)
    signal.throwIfAborted()
    return {
      size: bytes.byteLength, signal, dispose,
      content: { async *[Symbol.asyncIterator]() {
        for (let offset = 0; offset < bytes.byteLength; offset += 65536) {
          signal.throwIfAborted()
          yield bytes.subarray(offset, Math.min(offset + 65536, bytes.byteLength))
        }
      } },
    }
  } catch (error) {
    await dispose()
    if (error && typeof error === 'object' && Reflect.get(error, 'code') === 'FS_NOT_FOUND') throw new DeliveryNotFoundError()
    throw error
  }
}
