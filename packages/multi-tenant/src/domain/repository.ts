/** Internal control-plane facts. No Session projection or browser authority lives here. */
export interface DomainOwner {
  readonly tenantId: string
  readonly principalId: string
}

export type DomainState = 'stopped' | 'starting' | 'ready' | 'stopping' | 'failed'
export type DomainDesiredState = 'enabled' | 'suspended' | 'revoked'

export interface DomainRecord {
  readonly id: string
  readonly owner: DomainOwner
  readonly desired: DomainDesiredState
  readonly revision: number
  readonly generation: number
  readonly state: DomainState
  /** True until the provider positively confirms disposal, including failed starts. */
  readonly unresolved: boolean
}

export interface DomainRepository {
  resolve(owner: DomainOwner): DomainRecord
  get(id: string): DomainRecord
  begin(id: string): DomainRecord
  ready(id: string, generation: number): void
  stopping(id: string, generation: number): void
  finish(id: string, generation: number, released: boolean, failed: boolean): void
  setDesired(id: string, desired: DomainDesiredState): DomainRecord
  close(): void
}
