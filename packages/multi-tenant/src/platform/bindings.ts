import { DatabaseSync } from 'node:sqlite'
import { closeSync, openSync, lstatSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { identities, intentSchema, refSchema, type AllocationKey,
  type EnvironmentOwner,
  type EnvironmentRef,
} from '../environment-contract.ts'
import { PlatformError } from './errors.ts'
import { z } from 'zod'
import { environmentIdSchema, ownerEnvironmentId, type EnvironmentId } from './identity.ts'
export interface EnvironmentDefinition {
  readonly id: EnvironmentId
  readonly owner: EnvironmentOwner
}
export interface EnvironmentBinding extends EnvironmentDefinition {
  readonly allocationKey: AllocationKey
  readonly phase: 'reserved' | 'submitted' | 'bound' | 'delete-requested'
  readonly ref?: EnvironmentRef
  readonly pending?: 'stop' | 'start'
}
export function sameRef(a: EnvironmentRef, b: EnvironmentRef) {
  return (
    a.allocationKey === b.allocationKey &&
    a.owner.tenantId === b.owner.tenantId &&
    a.owner.principalId === b.owner.principalId &&
    a.namespace === b.namespace &&
    a.sandbox.name === b.sandbox.name &&
    a.sandbox.uid === b.sandbox.uid &&
    a.data.name === b.data.name &&
    a.data.uid === b.data.uid
  )
}

const bindingSchema = z.strictObject({
  id: environmentIdSchema,
  ...intentSchema.shape,
  phase: z.enum(['reserved', 'submitted', 'bound', 'delete-requested']),
  ref: refSchema.optional(),
  pending: z.enum(['stop', 'start']).optional(),
})
function parseBinding(value: unknown, id: EnvironmentId): EnvironmentBinding {
  const record = bindingSchema.parse(value)
  if (record.id !== id || record.id !== ownerEnvironmentId(record.owner) ||
      (['bound', 'delete-requested'].includes(record.phase) !== !!record.ref) ||
      (record.pending && record.phase !== 'bound') ||
      (record.ref && (record.ref.allocationKey !== record.allocationKey ||
        record.ref.owner.tenantId !== record.owner.tenantId || record.ref.owner.principalId !== record.owner.principalId)))
    throw new Error('Invalid persisted binding identity or phase')
  const { ref, pending, ...required } = record
  return { ...required, ...(ref ? { ref } : {}), ...(pending ? { pending } : {}) }
}

/** Private single-process binding journal. It stores authority and uncertainty, never Pod state. */
export class EnvironmentBindingStore {
  private readonly db: DatabaseSync
  private failure: PlatformError | undefined
  private closed = false
  constructor(filename: string) {
    try {
      const ownerUID = process.getuid?.()
      const parent = lstatSync(dirname(filename))
      if (
        !isAbsolute(filename) ||
        !parent.isDirectory() ||
        parent.uid !== ownerUID ||
        (parent.mode & 0o077) !== 0
      )
        throw new Error('Private state directory required')
      try {
        closeSync(openSync(filename, 'wx', 0o600))
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      }
      const info = lstatSync(filename)
      if (
        !info.isFile() ||
        (info.mode & 0o077) !== 0 ||
        info.uid !== ownerUID
      )
        throw new Error('Private state required')
      this.db = new DatabaseSync(filename)
      try {
        this.db.exec(
          'PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE;',
        )
        const version = this.db.prepare('PRAGMA user_version').get()?.['user_version']
        if (version === 0) {
          if (
            this.db
              .prepare(
                "SELECT count(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
              )
              .get()?.['n'] !== 0
          )
            throw new Error('Unsupported state')
          this.db.exec(
            'CREATE TABLE bindings (id TEXT PRIMARY KEY, record TEXT NOT NULL); PRAGMA user_version=20;',
          )
        } else if (version !== 20)
          throw new Error('Unsupported state format; no legacy migration')
        this.db.exec('COMMIT')
      } catch (error) {
        this.db.close()
        throw error
      }
    } catch (cause) {
      throw new PlatformError('StateUnavailable', randomUUID(),
        'Check private state permissions, exclusive ownership and current schema; do not erase existing allocations',
        {}, { stage: 'state', effect: 'not-submitted' }, { cause })
    }
  }

  reserve(owner: EnvironmentOwner): EnvironmentBinding {
    const id = ownerEnvironmentId(owner)
    const old = this.get(id)
    if (old) {
      if (
        old.owner.tenantId !== owner.tenantId ||
        old.owner.principalId !== owner.principalId
      )
        throw new Error('Owner collision')
      return old
    }
    const record: EnvironmentBinding = {
      id,
      owner: structuredClone(owner),
      allocationKey: identities.allocationKey(randomUUID()),
      phase: 'reserved',
    }
    try {
      this.db.prepare('INSERT INTO bindings VALUES (?,?)').run(id, JSON.stringify(record))
    } catch (cause) {
      this.unavailable(cause, randomUUID())
    }
    return record
  }
  private unavailable(cause: unknown, correlationId: string): never {
    this.failure = new PlatformError('StateUnavailable', correlationId,
      'Stop writes; inspect private state and original allocation', {}, { effect: 'unknown' }, { cause })
    throw this.failure
  }
  get(id: EnvironmentId): EnvironmentBinding | undefined {
    if (this.failure) throw this.failure
    try {
      if (this.closed) throw new Error('Binding store closed')
      const row = this.db.prepare('SELECT record FROM bindings WHERE id=?').get(id)
      if (!row) return undefined
      const encoded = row['record']
      if (typeof encoded !== 'string') throw new Error('Binding record must be text')
      const value: unknown = JSON.parse(encoded)
      return parseBinding(value, id)
    } catch (cause) {
      return this.unavailable(cause, randomUUID())
    }
  }
  save(record: EnvironmentBinding, correlationId: string) {
    try {
      parseBinding(record, record.id)
      const old = this.get(record.id)
      if (
        !old ||
        old.allocationKey !== record.allocationKey ||
        old.owner.tenantId !== record.owner.tenantId ||
        old.owner.principalId !== record.owner.principalId ||
        (old.ref && (!record.ref || !sameRef(old.ref, record.ref))) ||
        (old.phase !== 'reserved' && record.phase === 'reserved') ||
        (old.phase === 'delete-requested' &&
          record.phase !== 'delete-requested') ||
        (old.phase === 'bound' &&
          !['bound', 'delete-requested'].includes(record.phase)) ||
        ['bound', 'delete-requested'].includes(record.phase) !== !!record.ref
      )
        throw new Error('Invalid binding transition')
      this.db
        .prepare('UPDATE bindings SET record=? WHERE id=?')
        .run(JSON.stringify(record), record.id)
    } catch (cause) {
      this.unavailable(cause, correlationId)
    }
  }
  close() {
    if (this.closed) return
    this.db.close()
    this.closed = true
  }
}
