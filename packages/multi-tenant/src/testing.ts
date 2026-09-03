/** Executable contract for custom Agent directory providers. */

import { Context } from '@deepseek-ai/cordis'
import { AgentRecordConflictError } from './errors.ts'
import type { TenantAgentRepository } from './repository.ts'
import { createAgentId, type NewTenantAgentRecord, type PrincipalIdentity } from './types.ts'

export type TenantAgentRepositoryFactory = (
  ctx: Context,
) => TenantAgentRepository | PromiseLike<TenantAgentRepository>

function fail(clause: string, detail: unknown): never {
  throw new Error(`TenantAgentRepository contract violation (${clause}): ${String(detail)}`)
}

function record(
  owner: PrincipalIdentity,
  suffix: string,
  createdAt = '2026-01-01T00:00:00.000Z',
): NewTenantAgentRecord {
  return {
    id: createAgentId(),
    tenantId: owner.tenantId,
    principalId: owner.principalId,
    sessionId: `internal-${suffix}`,
    capabilityRevision: 'contract-capability-v1',
    mcpServers: Object.freeze(['contract-mcp']),
    createdAt,
  }
}

async function withRepository<T>(
  factory: TenantAgentRepositoryFactory,
  use: (repository: TenantAgentRepository) => Promise<T>,
): Promise<T> {
  const ctx = new Context()
  try {
    return await use(await factory(ctx))
  } finally {
    await ctx.fiber.dispose()
  }
}

/**
 * Prove atomic insert, Principal-scoped reads, ordered lists, the complete legal
 * state graph, CAS state changes, tombstones, and competing-writer behavior.
 */
export async function assertTenantAgentRepositoryContract(
  factory: TenantAgentRepositoryFactory,
): Promise<void> {
  const alice = Object.freeze({ tenantId: 'acme', principalId: 'alice' })
  const bob = Object.freeze({ tenantId: 'acme', principalId: 'bob' })
  const globexAlice = Object.freeze({ tenantId: 'globex', principalId: 'alice' })

  await withRepository(factory, async repository => {
    const input = record(alice, 'insert')
    const inserted = await repository.insert(input)
    if (inserted.state !== 'provisioning' || inserted.revision !== 0) {
      fail('atomic-insert', JSON.stringify(inserted))
    }
    if ((await repository.get(bob, input.id)) !== undefined) fail('principal-scope', 'Bob saw Alice')
    if ((await repository.get(globexAlice, input.id)) !== undefined) fail('tenant-scope', 'Globex saw Acme')
    if ((await repository.list(bob)).length !== 0) fail('scoped-list', 'Bob listed Alice')

    await repository.insert(record(alice, 'later', '2026-01-02T00:00:00.000Z'))
    const listed = await repository.list(alice)
    if (listed.length !== 2 || listed[0]?.id !== input.id) fail('ordered-list', JSON.stringify(listed))

    const wrongRevision = await repository.transition(alice, input.id, 9, {
      from: 'provisioning',
      to: 'ready',
      at: '2026-01-03T00:00:00.000Z',
    })
    if (wrongRevision !== undefined) fail('cas-revision', JSON.stringify(wrongRevision))

    const states = ['provisioning', 'ready', 'failed', 'deleted'] as const
    const legal = new Set(['provisioning:ready', 'provisioning:failed', 'ready:ready', 'ready:deleted'])
    for (const from of states) for (const to of states) {
      if (legal.has(`${from}:${to}`)) continue
      const transition = { from, to, at: '2026-01-03T00:00:00.000Z' }
      let rejected = false
      try {
        await repository.transition(alice, input.id, 0, transition as never)
      } catch (error) {
        rejected = error instanceof TypeError && error.message === 'Illegal Agent record transition.'
      }
      if (!rejected) fail('legal-state-graph', JSON.stringify(transition))
    }

    const ready = await repository.transition(alice, input.id, 0, {
      from: 'provisioning',
      to: 'ready',
      at: '2026-01-03T00:00:00.000Z',
    })
    if (ready?.state !== 'ready' || ready.revision !== 1) fail('provisioning-ready', JSON.stringify(ready))
    const refreshed = await repository.transition(alice, input.id, 1, {
      from: 'ready',
      to: 'ready',
      capabilityRevision: 'contract-capability-v2',
      at: '2026-01-04T00:00:00.000Z',
    })
    if (refreshed?.state !== 'ready' || refreshed.revision !== 2
      || refreshed.capabilityRevision !== 'contract-capability-v2') {
      fail('ready-refresh', JSON.stringify(refreshed))
    }
    const staleDelete = await repository.transition(alice, input.id, 1, {
      from: 'ready',
      to: 'deleted',
      at: '2026-01-04T00:00:00.000Z',
    })
    if (staleDelete !== undefined) fail('stale-ready-cas', JSON.stringify(staleDelete))
    const deleted = await repository.transition(alice, input.id, 2, {
      from: 'ready',
      to: 'deleted',
      at: '2026-01-05T00:00:00.000Z',
    })
    if (deleted?.state !== 'deleted' || deleted.deletedAt === undefined
      || deleted.sessionId !== `deleted:${input.id}`
      || deleted.capabilityRevision !== ''
      || deleted.mcpServers.length !== 0) {
      fail('tombstone', JSON.stringify(deleted))
    }

    const failedInput = record(alice, 'failed')
    await repository.insert(failedInput)
    const failed = await repository.transition(alice, failedInput.id, 0, {
      from: 'provisioning',
      to: 'failed',
      at: '2026-01-05T00:00:00.000Z',
    })
    if (failed?.state !== 'failed' || failed.revision !== 1) fail('provisioning-failed', JSON.stringify(failed))

    const raceInput = record(alice, 'race')
    await repository.insert(raceInput)
    const [left, right] = await Promise.all([
      repository.transition(alice, raceInput.id, 0, {
        from: 'provisioning',
        to: 'ready',
        at: '2026-01-03T00:00:00.000Z',
      }),
      repository.transition(alice, raceInput.id, 0, {
        from: 'provisioning',
        to: 'failed',
        at: '2026-01-03T00:00:00.000Z',
      }),
    ])
    if ([left, right].filter(Boolean).length !== 1) fail('competing-writers', JSON.stringify([left, right]))
    const winner = left ?? right
    if (winner === undefined || winner.revision !== 1) fail('cas-winner', JSON.stringify(winner))

    let duplicateConflict = false
    try {
      await repository.insert(input)
    } catch (error) {
      duplicateConflict = error instanceof AgentRecordConflictError
    }
    if (!duplicateConflict) fail('duplicate-insert', 'duplicate id/session was accepted')
  })
}
