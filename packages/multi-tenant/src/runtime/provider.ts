export interface RuntimeSpec {
  readonly domainId: string
  readonly generation: number
  readonly version: string
}

export interface RuntimeReady extends RuntimeSpec {
  readonly endpoint: string
  /** Host-owned Unix transport to an isolated runtime; never taken from a browser. */
  readonly socketPath?: string
  /** Host-only credential, never forwarded to browsers or persisted in the directory. */
  readonly authentication?: { readonly cookie: string }
}

export interface RuntimeHandle {
  readonly ready: Promise<RuntimeReady>
  /** Resolves on unexpected exit as well as normal stop; never rejects. */
  readonly exited: Promise<void>
  /** Idempotent. Success proves all owned resources released; failure is retryable.
   * Also owns resources acquired after cancellation. Must not resolve before these settle.
   */
  stop(): Promise<void>
}

export interface RuntimeProvider {
  /** Synchronously transfers cleanup ownership BEFORE awaiting startup.
   * Throwing means nothing was acquired (or everything was already released).
   * Asynchronous acquisition failures are reported via handle.ready.
   */
  acquire(spec: RuntimeSpec, signal: AbortSignal): RuntimeHandle
  /** Prove the previous generation no longer owns storage before clearing quarantine. */
  recover?(spec: RuntimeSpec): Promise<void>
}

/** Internal lease. An ingress must bind every request/stream to this signal. */
export interface RuntimeAdmission extends RuntimeReady {
  readonly revision: number
  readonly signal: AbortSignal
}
