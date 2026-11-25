import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { z } from 'zod'

/** Version of the environment adapter contract, independent of the reference DSH pin. */
export const ENVIRONMENT_CONTRACT_VERSION = 1

/** Domain identities retain their exact wire strings and cannot be interchanged. */
export type Identity<Tag extends string> = string & {
  readonly __dshIdentity: Tag
}
export type TenantId = Identity<'TenantId'>
export type PrincipalId = Identity<'PrincipalId'>
export type AllocationKey = Identity<'AllocationKey'>
export type EnvironmentNamespace = Identity<'EnvironmentNamespace'>
export type SandboxUID = Identity<'SandboxUID'>
export type PVCUID = Identity<'PVCUID'>
export type PodUID = Identity<'PodUID'>
export type ResourceVersion = Identity<'ResourceVersion'>

/** Apply a role to an identity produced by a trusted generator or admitted by a parser. */
function identity<Tag extends string>(_tag: Tag, value: string): Identity<Tag> {
  return value as Identity<Tag>
}
export const identities = {
  tenantId: (value: string) => identity('TenantId', value),
  principalId: (value: string) => identity('PrincipalId', value),
  allocationKey: (value: string) => identity('AllocationKey', value),
  namespace: (value: string) => identity('EnvironmentNamespace', value),
  sandboxUID: (value: string) => identity('SandboxUID', value),
  pvcUID: (value: string) => identity('PVCUID', value),
  podUID: (value: string) => identity('PodUID', value),
  revision: (value: string) => identity('ResourceVersion', value),
}

export interface EnvironmentOwner {
  readonly tenantId: TenantId
  readonly principalId: PrincipalId
}
/** Platform creates one allocation key per owner and never replaces an unknown write. */
export interface EnvironmentIntent {
  readonly allocationKey: AllocationKey
  readonly owner: EnvironmentOwner
}
/** Exact backing resource identities. Field names preserve the existing binding format. */
export interface EnvironmentRef extends EnvironmentIntent {
  readonly namespace: EnvironmentNamespace
  readonly sandbox: {
    readonly name: string
    readonly uid: SandboxUID
  }
  readonly data: {
    readonly name: string
    readonly uid: PVCUID
  }
}
export interface EnvironmentContext {
  readonly signal: AbortSignal
  readonly correlationId: string
}
export type EnvironmentState = 'Pending' | 'Ready' | 'Stopping' | 'Stopped' | 'StopUnverified' | 'Unavailable' | 'Deleting'
export interface EnvironmentView {
  readonly ref: EnvironmentRef
  /** Opaque adapter revision. Mutations compare the exact reference and revision. */
  readonly revision: ResourceVersion
  readonly state: EnvironmentState
  readonly origin: string
  readonly reason?: string
}
export interface EnvironmentConnection {
  readonly origin: string
  forward(request: IncomingMessage, response: ServerResponse): Promise<void>
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void>
}
export interface EnvironmentMutation {
  readonly view: EnvironmentView
  readonly effect: 'accepted' | 'not-submitted'
}
export interface EnvironmentDeletion {
  readonly ref: EnvironmentRef
  readonly effect: 'accepted' | 'not-submitted'
  readonly state: 'Deleting' | 'Deleted'
  readonly dataRetained: true
}
/** In-process contract for an authorized environment adapter. */
export interface AgentEnvironmentRuntime {
  create(intent: EnvironmentIntent, context: EnvironmentContext): Promise<EnvironmentView>
  /** Return null for an unbound allocation with no observed instance. A missing known UID is StaleInstance. */
  inspectAllocation(
    intent: EnvironmentIntent, expected: EnvironmentRef | undefined, context: EnvironmentContext,
  ): Promise<EnvironmentView | null>
  inspect(ref: EnvironmentRef, context: EnvironmentContext): Promise<EnvironmentView>
  /** signal owns the full connection lifetime: abort rejects new requests and closes
   * all established HTTP streams/WebSockets, including after connect resolves. */
  connect(ref: EnvironmentRef, context: EnvironmentContext): Promise<EnvironmentConnection>
  /** Stop access first. Stopped requires positive termination proof for the exact writer. */
  stop(ref: EnvironmentRef, revision: ResourceVersion, context: EnvironmentContext): Promise<EnvironmentMutation>
  /** Only a positively Stopped environment with the same PVC UID may start. */
  start(ref: EnvironmentRef, revision: ResourceVersion, context: EnvironmentContext): Promise<EnvironmentMutation>
  /** Delete runtime resources after verified stop and retain the original data volume. */
  delete(ref: EnvironmentRef, revision: ResourceVersion, context: EnvironmentContext): Promise<EnvironmentDeletion>
}
export type EnvironmentErrorCode =
  | 'InvalidConfiguration' | 'Forbidden' | 'OwnerMismatch' | 'IntentConflict' | 'StaleInstance'
  | 'StorageMismatch' | 'TemplateMismatch' | 'NotReady' | 'ReadUnavailable' | 'AllocationUnresolved'
  | 'CreateRejected' | 'CreateOutcomeUnknown' | 'StopRejected' | 'StopUnverified' | 'StartRejected'
  | 'StartOutcomeUnknown' | 'DeleteRejected' | 'DeleteOutcomeUnknown' | 'AccessRejected' | 'ForwardOutcomeUnknown'
export interface EnvironmentFailure {
  readonly code: EnvironmentErrorCode
  readonly stage: 'configuration' | 'create' | 'inspect' | 'access' | 'stop' | 'start' | 'delete'
  readonly effect: 'not-submitted' | 'accepted' | 'unknown'
  readonly observedState: EnvironmentState | 'Missing' | 'unverified'
  readonly retry: 'never' | 'read-first'
  readonly allocationKey: AllocationKey | ''
  readonly correlationId: string
  readonly nextAction: string
}

/** Supply a redacted diagnostic. The cause stays private. */
export class EnvironmentError extends Error {
  constructor(readonly failure: EnvironmentFailure, options?: ErrorOptions) {
    super(failure.code, options)
    this.name = 'EnvironmentError'
  }
  toJSON(): EnvironmentFailure {
    const { code, stage, effect, observedState, retry, allocationKey, correlationId, nextAction } = this.failure
    return { code, stage, effect, observedState, retry, allocationKey, correlationId, nextAction }
  }
}

// The original identity limit counts UTF-16 code units. Preserve the exact wire strings.
const opaque = z.string().min(1).refine(value => value.length <= 256, 'Identity exceeds 256 code units')
export const ownerSchema = z.strictObject({
  tenantId: opaque.transform(identities.tenantId),
  principalId: opaque.transform(identities.principalId),
})
export const intentSchema = z.strictObject({
  allocationKey: opaque.transform(identities.allocationKey),
  owner: ownerSchema,
})
export const refSchema = z.strictObject({
  ...intentSchema.shape,
  namespace: opaque.transform(identities.namespace),
  sandbox: z.strictObject({ name: opaque, uid: opaque.transform(identities.sandboxUID) }),
  data: z.strictObject({ name: opaque, uid: opaque.transform(identities.pvcUID) }),
})
export const parseEnvironmentOwner = (value: unknown): EnvironmentOwner => ownerSchema.parse(value)
export const parseEnvironmentIntent = (value: unknown): EnvironmentIntent => intentSchema.parse(value)
export const parseEnvironmentRef = (value: unknown): EnvironmentRef => refSchema.parse(value)
