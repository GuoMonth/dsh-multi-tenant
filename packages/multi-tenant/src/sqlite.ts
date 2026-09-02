/** Zero-service durable Agent directory backed by Node's built-in SQLite. */

import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Context } from '@deepseek-ai/cordis'
import { AgentRecordConflictError } from './errors.ts'
import { TenantAgentRepository } from './repository.ts'
import { parseAgentId, type AgentRecordState, type PrincipalIdentity, type TenantAgentRecord } from './types.ts'
import type { AgentId, AgentRecordTransition, NewTenantAgentRecord } from './types.ts'

const DEFAULT_BUSY_TIMEOUT_MS = 5_000
const DEFAULT_DIRECTORY = '.dsh-multi-tenant'
const DEFAULT_FILENAME = 'agents.sqlite'
const EXPECTED_COLUMNS = [
  'agent_id',
  'tenant_id',
  'principal_id',
  'session_id',
  'state',
  'revision',
  'capability_revision',
  'mcp_servers',
  'created_at',
  'updated_at',
  'deleted_at',
] as const

export interface SQLiteTenantAgentRepositoryConfig {
  /** Defaults to `<cwd>/.dsh-multi-tenant/agents.sqlite`. */
  readonly path?: string
  readonly busyTimeoutMs?: number
}

export function defaultSQLiteTenantAgentRepositoryPath(cwd = process.cwd()): string {
  return join(cwd, DEFAULT_DIRECTORY, DEFAULT_FILENAME)
}

function databasePath(configured: string | undefined): string {
  const value = configured ?? process.env.DSH_MULTI_TENANT_DB_PATH ?? defaultSQLiteTenantAgentRepositoryPath()
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError('SQLite Agent repository path must be a non-empty trimmed string')
  }
  return value === ':memory:' ? value : resolve(value)
}

function busyTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_BUSY_TIMEOUT_MS
  if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 60_000) {
    throw new TypeError('SQLite busyTimeoutMs must be an integer between 0 and 60000')
  }
  return timeout
}

function state(value: unknown): AgentRecordState {
  if (value === 'provisioning' || value === 'ready' || value === 'failed' || value === 'deleted') return value
  throw new Error('SQLite Agent repository returned an invalid state')
}

function text(row: object, key: string): string {
  const value = Reflect.get(row, key)
  if (typeof value !== 'string') throw new Error(`SQLite Agent repository returned invalid ${key}`)
  return value
}

function readRecord(row: unknown): TenantAgentRecord | undefined {
  if (row === undefined) return undefined
  if (typeof row !== 'object' || row === null) throw new Error('SQLite Agent repository returned a malformed row')
  const rawServers: unknown = JSON.parse(text(row, 'mcp_servers'))
  if (!Array.isArray(rawServers) || rawServers.some(item => typeof item !== 'string')) {
    throw new Error('SQLite Agent repository returned invalid MCP servers')
  }
  const revision = Reflect.get(row, 'revision')
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('SQLite Agent repository returned invalid revision')
  }
  const deleted = Reflect.get(row, 'deleted_at')
  if (deleted !== null && typeof deleted !== 'string') {
    throw new Error('SQLite Agent repository returned invalid deleted_at')
  }
  return Object.freeze({
    id: parseAgentId(text(row, 'agent_id')),
    tenantId: text(row, 'tenant_id'),
    principalId: text(row, 'principal_id'),
    sessionId: text(row, 'session_id'),
    state: state(Reflect.get(row, 'state')),
    revision,
    capabilityRevision: text(row, 'capability_revision'),
    mcpServers: Object.freeze([...rawServers]),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
    ...(deleted === null ? {} : { deletedAt: deleted }),
  })
}

export class SQLiteTenantAgentRepository extends TenantAgentRepository {
  readonly path: string
  private readonly database: DatabaseSync
  private readonly insertRecord: ReturnType<DatabaseSync['prepare']>
  private readonly selectOwned: ReturnType<DatabaseSync['prepare']>
  private readonly listOwned: ReturnType<DatabaseSync['prepare']>
  private readonly transitionRecord: ReturnType<DatabaseSync['prepare']>

  constructor(ctx: Context, config: SQLiteTenantAgentRepositoryConfig = {}) {
    super(ctx)
    this.path = databasePath(config.path)
    if (this.path !== ':memory:') mkdirSync(dirname(this.path), { recursive: true })
    const database = new DatabaseSync(this.path)
    try {
      database.exec(`
        PRAGMA busy_timeout = ${busyTimeout(config.busyTimeoutMs)};
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS tenant_agents_v04 (
          agent_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          principal_id TEXT NOT NULL,
          session_id TEXT NOT NULL UNIQUE,
          state TEXT NOT NULL CHECK (state IN ('provisioning', 'ready', 'failed', 'deleted')),
          revision INTEGER NOT NULL CHECK (revision >= 0),
          capability_revision TEXT NOT NULL,
          mcp_servers TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        ) STRICT;
        CREATE INDEX IF NOT EXISTS tenant_agents_v04_owner
          ON tenant_agents_v04 (tenant_id, principal_id, created_at, agent_id);
      `)
      const columns = database.prepare('PRAGMA table_info(tenant_agents_v04)').all()
        .map(column => Reflect.get(column, 'name'))
      if (columns.length !== EXPECTED_COLUMNS.length
        || columns.some((column, index) => column !== EXPECTED_COLUMNS[index])) {
        throw new Error(
          'Unsupported dsh-multi-tenant prerelease SQLite schema. '
          + 'Back up and recreate the Agent directory database; candidate schemas are not migrated.',
        )
      }
      this.insertRecord = database.prepare(`
        INSERT INTO tenant_agents_v04 (
          agent_id, tenant_id, principal_id, session_id, state, revision,
          capability_revision, mcp_servers, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, 'provisioning', 0, ?, ?, ?, ?, NULL)
      `)
      this.selectOwned = database.prepare(`
        SELECT * FROM tenant_agents_v04
        WHERE agent_id = ? AND tenant_id = ? AND principal_id = ?
      `)
      this.listOwned = database.prepare(`
        SELECT * FROM tenant_agents_v04
        WHERE tenant_id = ? AND principal_id = ?
        ORDER BY created_at, agent_id
      `)
      this.transitionRecord = database.prepare(`
        UPDATE tenant_agents_v04
        SET state = ?, revision = revision + 1,
            session_id = CASE WHEN ? = 'deleted' THEN 'deleted:' || agent_id ELSE session_id END,
            capability_revision = CASE WHEN ? = 'deleted' THEN '' ELSE ? END,
            mcp_servers = CASE WHEN ? = 'deleted' THEN '[]' ELSE ? END,
            updated_at = ?, deleted_at = ?
        WHERE agent_id = ? AND tenant_id = ? AND principal_id = ?
          AND revision = ? AND state = ?
      `)
    } catch (error) {
      database.close()
      throw error
    }
    this.database = database
    ctx.effect(() => () => this.database.close(), 'dsh-multi-tenant: close SQLite Agent repository')
  }

  override async insert(record: NewTenantAgentRecord): Promise<TenantAgentRecord> {
    try {
      this.insertRecord.run(
        record.id,
        record.tenantId,
        record.principalId,
        record.sessionId,
        record.capabilityRevision,
        JSON.stringify(record.mcpServers),
        record.createdAt,
        record.createdAt,
      )
    } catch (error) {
      if (typeof error === 'object' && error !== null) {
        const errcode = Reflect.get(error, 'errcode')
        if ((typeof errcode === 'number' && (errcode & 0xff) === 19)
          || Reflect.get(error, 'errstr') === 'constraint failed') {
          throw new AgentRecordConflictError({ cause: error })
        }
      }
      throw error
    }
    const created = readRecord(this.selectOwned.get(record.id, record.tenantId, record.principalId))
    if (created === undefined) throw new Error('SQLite Agent repository did not persist the inserted record')
    return created
  }

  override async get(principal: PrincipalIdentity, id: AgentId): Promise<TenantAgentRecord | undefined> {
    return readRecord(this.selectOwned.get(id, principal.tenantId, principal.principalId))
  }

  override async list(principal: PrincipalIdentity): Promise<readonly TenantAgentRecord[]> {
    return Object.freeze(this.listOwned.all(principal.tenantId, principal.principalId).map(row => {
      const record = readRecord(row)
      if (record === undefined) throw new Error('SQLite Agent repository returned an empty row')
      return record
    }))
  }

  override async transition(
    principal: PrincipalIdentity,
    id: AgentId,
    expectedRevision: number,
    transition: AgentRecordTransition,
  ): Promise<TenantAgentRecord | undefined> {
    const current = readRecord(this.selectOwned.get(id, principal.tenantId, principal.principalId))
    if (current === undefined || current.revision !== expectedRevision || current.state !== transition.from) {
      return undefined
    }
    const result = this.transitionRecord.run(
      transition.to,
      transition.to,
      transition.to,
      transition.capabilityRevision ?? current.capabilityRevision,
      transition.to,
      JSON.stringify(transition.mcpServers ?? current.mcpServers),
      transition.at,
      transition.to === 'deleted' ? transition.at : null,
      id,
      principal.tenantId,
      principal.principalId,
      expectedRevision,
      transition.from,
    )
    if (Number(result.changes) !== 1) return undefined
    return readRecord(this.selectOwned.get(id, principal.tenantId, principal.principalId))
  }
}

export default SQLiteTenantAgentRepository
