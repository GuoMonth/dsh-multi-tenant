import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { DomainDesiredState, DomainOwner, DomainRecord, DomainRepository } from './repository.ts'

function identity(owner: DomainOwner): void {
  for (const value of [owner.tenantId, owner.principalId]) {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
      throw new TypeError('Domain owner fields must be non-empty trimmed strings')
    }
  }
}

/** Single-active coordinator, local storage only; directory must be platform-owned.
 * A separate SQLite exclusive transaction is the OS-released coordinator lock.
 * It is NOT a runtime/storage fence. Unclean domain leases remain quarantined.
 */
export class SQLiteDomainRepository implements DomainRepository {
  private readonly guard: DatabaseSync
  private readonly database: DatabaseSync
  private closed = false

  constructor(directory: string) {
    const root = resolve(directory)
    mkdirSync(root, { recursive: true, mode: 0o700 })
    const guard = new DatabaseSync(join(root, 'coordinator.sqlite'))
    let database: DatabaseSync | undefined
    try {
      guard.exec('PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;')
      database = new DatabaseSync(join(root, 'domains.sqlite'))
      database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS domains_v1 (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          principal_id TEXT NOT NULL,
          desired TEXT NOT NULL CHECK (desired IN ('enabled','suspended','revoked')),
          revision INTEGER NOT NULL CHECK (revision >= 0),
          generation INTEGER NOT NULL CHECK (generation >= 0),
          state TEXT NOT NULL CHECK (state IN ('stopped','starting','ready','stopping','failed')),
          unresolved INTEGER NOT NULL CHECK (unresolved IN (0,1)),
          UNIQUE (tenant_id, principal_id)
        ) STRICT;
        UPDATE domains_v1 SET state = 'failed' WHERE unresolved = 1;
      `)
    } catch (error) {
      const errors = [error]
      try { database?.close() } catch (cleanup) { errors.push(cleanup) }
      try { guard.close() } catch (cleanup) { errors.push(cleanup) }
      throw new AggregateError(errors, 'Cannot acquire the domain directory coordinator')
    }
    this.guard = guard
    this.database = database
  }

  resolve(owner: DomainOwner): DomainRecord {
    identity(owner)
    this.database.prepare(`INSERT INTO domains_v1 VALUES (?, ?, ?, 'enabled', 0, 0, 'stopped', 0)
      ON CONFLICT (tenant_id, principal_id) DO NOTHING`).run(randomUUID(), owner.tenantId, owner.principalId)
    const row = this.database.prepare('SELECT id FROM domains_v1 WHERE tenant_id = ? AND principal_id = ?')
      .get(owner.tenantId, owner.principalId)!
    return this.get(String(row.id))
  }

  get(id: string): DomainRecord {
    const row = this.database.prepare('SELECT * FROM domains_v1 WHERE id = ?').get(id)
    if (!row) throw new Error('Unknown domain')
    return Object.freeze({
      id: String(row.id),
      owner: Object.freeze({ tenantId: String(row.tenant_id), principalId: String(row.principal_id) }),
      desired: row.desired as DomainRecord['desired'],
      state: row.state as DomainRecord['state'],
      revision: Number(row.revision),
      generation: Number(row.generation),
      unresolved: row.unresolved === 1,
    })
  }

  begin(id: string): DomainRecord {
    const result = this.database.prepare(`UPDATE domains_v1
      SET generation = generation + 1, state = 'starting', unresolved = 1
      WHERE id = ? AND desired = 'enabled' AND unresolved = 0
        AND state IN ('stopped','failed') AND generation < 9007199254740991`).run(id)
    if (result.changes !== 1) throw new Error('Domain disabled, busy, or awaiting verified runtime recovery')
    return this.get(id)
  }

  ready(id: string, generation: number): void {
    const result = this.database.prepare(`UPDATE domains_v1 SET state = 'ready'
      WHERE id = ? AND generation = ? AND state = 'starting' AND desired = 'enabled'`).run(id, generation)
    if (result.changes !== 1) throw new Error('Stale domain readiness')
  }

  stopping(id: string, generation: number): void {
    this.database.prepare(`UPDATE domains_v1 SET state = 'stopping'
      WHERE id = ? AND generation = ? AND unresolved = 1`).run(id, generation)
  }

  finish(id: string, generation: number, released: boolean, failed: boolean): void {
    const result = this.database.prepare(`UPDATE domains_v1 SET state = ?, unresolved = ?
      WHERE id = ? AND generation = ?`).run(failed || !released ? 'failed' : 'stopped', released ? 0 : 1, id, generation)
    if (result.changes !== 1) throw new Error('Stale domain disposal')
  }

  setDesired(id: string, desired: DomainDesiredState): DomainRecord {
    const current = this.get(id)
    if (current.desired === desired) return current
    if (current.desired === 'revoked') throw new Error('Revoked domains cannot be re-enabled')
    const result = this.database.prepare(`UPDATE domains_v1 SET desired = ?, revision = revision + 1
      WHERE id = ? AND revision < 9007199254740991`).run(desired, id)
    if (result.changes !== 1) throw new Error('Cannot update domain policy')
    return this.get(id)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    const errors: unknown[] = []
    try { this.database.close() } catch (error) { errors.push(error) }
    try { this.guard.close() } catch (error) { errors.push(error) }
    if (errors.length) throw new AggregateError(errors, 'Domain directory close failed')
  }
}
