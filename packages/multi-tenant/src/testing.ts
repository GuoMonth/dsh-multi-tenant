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
 * Prove atomic insert, Principal-scoped reads, ordered lists, CAS state changes,
 * tombstones, and competing-writer behavior against a fresh repository.
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

    const [left, right] = await Promise.all([
      repository.transition(alice, input.id, 0, {
        from: 'provisioning',
        to: 'ready',
        at: '2026-01-03T00:00:00.000Z',
      }),
      repository.transition(alice, input.id, 0, {
        from: 'provisioning',
        to: 'failed',
        at: '2026-01-03T00:00:00.000Z',
      }),
    ])
    if ([left, right].filter(Boolean).length !== 1) fail('competing-writers', JSON.stringify([left, right]))
    const winner = left ?? right
    if (winner === undefined || winner.revision !== 1) fail('cas-winner', JSON.stringify(winner))

    if (winner.state === 'ready') {
      const tombstone = await repository.transition(alice, input.id, 1, {
        from: 'ready',
        to: 'deleted',
        at: '2026-01-04T00:00:00.000Z',
      })
      if (tombstone?.state !== 'deleted' || tombstone.deletedAt === undefined
        || tombstone.sessionId !== `deleted:${input.id}`
        || tombstone.capabilityRevision !== ''
        || tombstone.mcpServers.length !== 0) {
        fail('tombstone', JSON.stringify(tombstone))
      }
    }

    let duplicateConflict = false
    try {
      await repository.insert(input)
    } catch (error) {
      duplicateConflict = error instanceof AgentRecordConflictError
    }
    if (!duplicateConflict) fail('duplicate-insert', 'duplicate id/session was accepted')
  })
}
