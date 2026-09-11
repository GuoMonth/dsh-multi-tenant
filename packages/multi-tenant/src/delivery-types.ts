import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionReadRequest } from './observation.ts'

export interface DeliverySummary { readonly ref: string; readonly name: string; readonly description?: string }
export interface FileReadRequest extends SessionReadRequest {
  readonly header: SessionHeader
  /** Resolved from an authorized own deliverables/presented event. */
  readonly path: string
  readonly maxBytes: number
}
export interface FileReadLease {
  readonly size: number
  readonly content: AsyncIterable<Uint8Array>
  readonly signal?: AbortSignal
  /** Idempotent, including after abort or partial consumption. */
  dispose(): void | PromiseLike<void>
}
export interface DeliveryFile extends FileReadLease {
  readonly name: string
  readonly contentType: string
  readonly signal: AbortSignal
  dispose(): Promise<void>
}
