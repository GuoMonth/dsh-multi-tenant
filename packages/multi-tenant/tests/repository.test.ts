import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryTenantAgentRepository } from '../src/repository.ts'
import { SQLiteTenantAgentRepository } from '../src/sqlite.ts'
import { assertTenantAgentRepositoryContract } from '../src/testing.ts'
import { createAgentId, type NewTenantAgentRecord } from '../src/types.ts'

const temporaryDirectories: string[] = []

async function temporaryDatabase(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-mt-v04-'))
  temporaryDirectories.push(directory)
  return join(directory, 'agents.sqlite')
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function input(suffix: string): NewTenantAgentRecord {
  return {
    id: createAgentId(),
    tenantId: 'acme',
    principalId: 'alice',
    sessionId: `internal-${suffix}`,
    capabilityRevision: 'capability-v1',
    mcpServers: ['shared'],
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('TenantAgentRepository contract', () => {
  it('is implemented by the in-memory provider', async () => {
    await assertTenantAgentRepositoryContract(ctx => new InMemoryTenantAgentRepository(ctx))
  })

  it('is implemented by the SQLite provider', async () => {
    await assertTenantAgentRepositoryContract(ctx => new SQLiteTenantAgentRepository(ctx, { path: ':memory:' }))
  })

  it('survives SQLite restart without reading any v0.3 ownership table', async () => {
    const path = await temporaryDatabase()
    const owner = { tenantId: 'acme', principalId: 'alice' }
    const created = input('restart')
    const first = new Context()
    const firstRepository = new SQLiteTenantAgentRepository(first, { path })
    await firstRepository.insert(created)
    await firstRepository.transition(owner, created.id, 0, {
      from: 'provisioning',
      to: 'ready',
      at: '2026-01-02T00:00:00.000Z',
    })
    await first.fiber.dispose()

    const second = new Context()
    try {
      const secondRepository = new SQLiteTenantAgentRepository(second, { path })
      await expect(secondRepository.get(owner, created.id)).resolves.toEqual(expect.objectContaining({
        id: created.id,
        state: 'ready',
        sessionId: 'internal-restart',
      }))
    } finally {
      await second.fiber.dispose()
    }
  })

  it('atomically reconciles abandoned provisioning before a restarted repository is exposed', async () => {
    const path = await temporaryDatabase()
    const owner = { tenantId: 'acme', principalId: 'alice' }
    const abandoned = input('abandoned')
    const ready = input('ready')
    const failed = input('failed')
    const first = new Context()
    const firstRepository = new SQLiteTenantAgentRepository(first, { path })
    await firstRepository.insert(abandoned)
    await firstRepository.insert(ready)
    await firstRepository.insert(failed)
    await firstRepository.transition(owner, ready.id, 0, {
      from: 'provisioning', to: 'ready', at: '2026-01-02T00:00:00.000Z',
    })
    await firstRepository.transition(owner, failed.id, 0, {
      from: 'provisioning', to: 'failed', at: '2026-01-03T00:00:00.000Z',
    })
    await first.fiber.dispose()

    const second = new Context()
    try {
      const repository = new SQLiteTenantAgentRepository(second, { path })
      const records = await repository.list(owner)
      expect(records.find(record => record.id === abandoned.id)).toEqual(expect.objectContaining({
        state: 'failed', revision: 1, sessionId: 'internal-abandoned',
      }))
      expect(records.find(record => record.id === ready.id)).toEqual(expect.objectContaining({
        state: 'ready', revision: 1, updatedAt: '2026-01-02T00:00:00.000Z',
      }))
      expect(records.find(record => record.id === failed.id)).toEqual(expect.objectContaining({
        state: 'failed', revision: 1, updatedAt: '2026-01-03T00:00:00.000Z',
      }))

      const inspection = new DatabaseSync(path)
      try {
        const plan = inspection.prepare(
          "EXPLAIN QUERY PLAN SELECT agent_id FROM tenant_agents_v04 WHERE state = 'provisioning'",
        ).all()
        expect(JSON.stringify(plan)).toContain('tenant_agents_v04_provisioning')
      } finally {
        inspection.close()
      }
    } finally {
      await second.fiber.dispose()
    }
  })

  it('uses database CAS across competing SQLite connections', async () => {
    const path = await temporaryDatabase()
    const owner = { tenantId: 'acme', principalId: 'alice' }
    const created = input('race')
    const leftContext = new Context()
    const rightContext = new Context()
    try {
      const left = new SQLiteTenantAgentRepository(leftContext, { path })
      const right = new SQLiteTenantAgentRepository(rightContext, { path })
      await left.insert(created)
      const results = await Promise.all([
        left.transition(owner, created.id, 0, {
          from: 'provisioning', to: 'ready', at: '2026-01-02T00:00:00.000Z',
        }),
        right.transition(owner, created.id, 0, {
          from: 'provisioning', to: 'failed', at: '2026-01-02T00:00:00.000Z',
        }),
      ])
      expect(results.filter(Boolean)).toHaveLength(1)
    } finally {
      await Promise.all([leftContext.fiber.dispose(), rightContext.fiber.dispose()])
    }
  })

  it('scrubs runtime capability data when retaining a tombstone', async () => {
    const ctx = new Context()
    try {
      const repository = new InMemoryTenantAgentRepository(ctx)
      const created = input('deleted')
      const owner = { tenantId: 'acme', principalId: 'alice' }
      await repository.insert(created)
      await repository.transition(owner, created.id, 0, {
        from: 'provisioning', to: 'ready', at: '2026-01-02T00:00:00.000Z',
      })
      const deleted = await repository.transition(owner, created.id, 1, {
        from: 'ready', to: 'deleted', at: '2026-01-03T00:00:00.000Z',
      })
      expect(deleted).toEqual(expect.objectContaining({
        sessionId: `deleted:${created.id}`,
        capabilityRevision: '',
        mcpServers: [],
      }))
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects the unpublished schema that still contains policy_revision', async () => {
    const path = await temporaryDatabase()
    const database = new DatabaseSync(path)
    database.exec(`
      CREATE TABLE tenant_agents_v04 (
        agent_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        session_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        revision INTEGER NOT NULL,
        policy_revision TEXT NOT NULL,
        capability_revision TEXT NOT NULL,
        mcp_servers TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      ) STRICT;
    `)
    database.close()

    const ctx = new Context()
    try {
      expect(() => new SQLiteTenantAgentRepository(ctx, { path }))
        .toThrow(/recreate the Agent directory database/)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
