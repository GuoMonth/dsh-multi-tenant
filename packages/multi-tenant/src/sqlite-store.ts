/**
 * Zero-external-service durable TenantSessionStore backed by Node's built-in
 * `node:sqlite` module.
 *
 * The provider intentionally stores only immutable Session ownership. Product
 * users, credentials, Agent state and audit data remain outside this database.
 *
 * @module dsh-multi-tenant/sqlite-store
 */

import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Context } from '@deepseek-ai/cordis'
import { TenantSessionStore } from './store.ts'
import type { ClaimResult, SessionOwner } from './types.ts'

const DEFAULT_BUSY_TIMEOUT_MS = 5_000
const DEFAULT_DIRECTORY = '.dsh-multi-tenant'
const DEFAULT_FILENAME = 'session-ownership.sqlite'

export interface SQLiteTenantSessionStoreConfig {
  /**
   * SQLite database path. Defaults to
   * `<cwd>/.dsh-multi-tenant/session-ownership.sqlite`.
   *
   * `DSH_MULTI_TENANT_SQLITE_PATH` overrides the default when this option is
   * omitted. `:memory:` is accepted for tests, but is not durable.
   */
  readonly path?: string
  /** SQLite busy timeout used when another process briefly holds the writer lock. */
  readonly busyTimeoutMs?: number
}

/** Default zero-config durable database location for a DSH working directory. */
export function defaultSQLiteTenantSessionStorePath(cwd = process.cwd()): string {
  return join(cwd, DEFAULT_DIRECTORY, DEFAULT_FILENAME)
}

function resolveDatabasePath(configured: string | undefined): string {
  const value = configured ?? process.env.DSH_MULTI_TENANT_SQLITE_PATH ?? defaultSQLiteTenantSessionStorePath()
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError('SQLite session store path must be a non-empty trimmed string')
  }
  return value === ':memory:' ? value : resolve(value)
}

function resolveBusyTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_BUSY_TIMEOUT_MS
  if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 60_000) {
    throw new TypeError('SQLite busyTimeoutMs must be an integer between 0 and 60000')
  }
  return timeout
}

function readOwner(row: unknown): SessionOwner | undefined {
  if (row === undefined) return undefined
  if (typeof row !== 'object' || row === null) {
    throw new Error('SQLite session store returned a malformed owner row')
  }
  const tenantId = Reflect.get(row, 'tenant_id')
  const userId = Reflect.get(row, 'user_id')
  if (typeof tenantId !== 'string' || typeof userId !== 'string') {
    throw new Error('SQLite session store returned a malformed owner row')
  }
  return { tenantId, userId }
}

/**
 * Durable local-development Session ownership provider.
 *
 * `claim()` is one atomic `INSERT ... ON CONFLICT DO NOTHING` followed by a
 * read of the immutable winner. SQLite serializes competing writers, so the
 * same contract works across multiple DSH processes sharing one database file.
 */
export class SQLiteTenantSessionStore extends TenantSessionStore {
  readonly path: string

  private readonly database: DatabaseSync
  private readonly insertOwner: ReturnType<DatabaseSync['prepare']>
  private readonly selectOwner: ReturnType<DatabaseSync['prepare']>

  constructor(ctx: Context, config: SQLiteTenantSessionStoreConfig = {}) {
    super(ctx)

    this.path = resolveDatabasePath(config.path)
    const busyTimeoutMs = resolveBusyTimeout(config.busyTimeoutMs)
    if (this.path !== ':memory:') mkdirSync(dirname(this.path), { recursive: true })

    const database = new DatabaseSync(this.path)
    try {
      database.exec(`
        PRAGMA busy_timeout = ${busyTimeoutMs};
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS session_owners (
          session_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          user_id TEXT NOT NULL
        ) STRICT;
      `)
      this.insertOwner = database.prepare(`
        INSERT INTO session_owners (session_id, tenant_id, user_id)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO NOTHING
      `)
      this.selectOwner = database.prepare(`
        SELECT tenant_id, user_id
        FROM session_owners
        WHERE session_id = ?
      `)
    } catch (error) {
      database.close()
      throw error
    }
    this.database = database

    ctx.effect(() => () => {
      this.database.close()
    }, 'dsh-multi-tenant: close SQLite TenantSessionStore')
  }

  override async claim(sessionId: string, owner: SessionOwner): Promise<ClaimResult> {
    const inserted = this.insertOwner.run(sessionId, owner.tenantId, owner.userId)
    if (Number(inserted.changes) === 1) return 'created'

    const existing = readOwner(this.selectOwner.get(sessionId))
    if (existing === undefined) {
      throw new Error('SQLite session ownership claim lost its persisted winner')
    }
    if (existing.tenantId === owner.tenantId && existing.userId === owner.userId) {
      return 'idempotent'
    }
    return 'conflict'
  }

  override async get(sessionId: string): Promise<SessionOwner | undefined> {
    return readOwner(this.selectOwner.get(sessionId))
  }
}

export default SQLiteTenantSessionStore
