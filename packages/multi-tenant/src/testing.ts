/**
 * Contract test suite for the `TenantSessionStore` provider seam.
 *
 * Exposed via the `dsh-multi-tenant/testing` subpath so a third-party provider
 * (PostgreSQL / Redis / …) can prove it satisfies the same contract as the
 * official in-memory default. This is the executable form of "default ≠ only".
 *
 * The suite is framework-agnostic: it takes a store factory and throws an
 * `Error` naming the violated clause — the caller wraps it in its own test
 * runner (the core uses Vitest).
 *
 * @module dsh-multi-tenant/testing
 */

import { Context } from '@deepseek-ai/cordis'
import type { TenantSessionStore } from './store.ts'
import type { SessionOwner } from './types.ts'

/** Produce a fresh, isolated store for one contract clause. */
export type TenantSessionStoreFactory = (ctx: Context) => TenantSessionStore | Promise<TenantSessionStore>

function fail(clause: string, detail: unknown): never {
  throw new Error(`TenantSessionStore contract violation (${clause}): ${String(detail)}`)
}

/** Run `fn` against a fresh store, then dispose its owning Context. */
async function withStore<T>(
  factory: TenantSessionStoreFactory,
  fn: (store: TenantSessionStore) => Promise<T>,
): Promise<T> {
  const ctx = new Context()
  const store = await factory(ctx)
  try {
    return await fn(store)
  } finally {
    await ctx.fiber.dispose()
  }
}

/**
 * Assert that `factory` produces stores satisfying the `TenantSessionStore`
 * contract: atomic claim, idempotent same-owner claim, conflict (never
 * overwrite), `get` semantics, defensive copy, and atomic concurrency.
 */
export async function assertTenantSessionStoreContract(factory: TenantSessionStoreFactory): Promise<void> {
  const alice: SessionOwner = { tenantId: 'acme', userId: 'alice' }
  const bob: SessionOwner = { tenantId: 'acme', userId: 'bob' }
  const eve: SessionOwner = { tenantId: 'evilcorp', userId: 'alice' }

  // 1. first claim establishes ownership.
  await withStore(factory, async (store) => {
    const result = await store.claim('s1', alice)
    if (result !== 'created') fail('first-claim', result)
  })

  // 2. same-owner re-claim is idempotent.
  await withStore(factory, async (store) => {
    await store.claim('s1', alice)
    const result = await store.claim('s1', alice)
    if (result !== 'idempotent') fail('idempotent-reclaim', result)
  })

  // 3. different user in the same tenant conflicts.
  await withStore(factory, async (store) => {
    await store.claim('s1', alice)
    const result = await store.claim('s1', bob)
    if (result !== 'conflict') fail('same-tenant-different-user', result)
  })

  // 4. different tenant conflicts.
  await withStore(factory, async (store) => {
    await store.claim('s1', alice)
    const result = await store.claim('s1', eve)
    if (result !== 'conflict') fail('different-tenant', result)
  })

  // 5. a conflict never overwrites the original owner.
  await withStore(factory, async (store) => {
    await store.claim('s1', alice)
    await store.claim('s1', bob)
    const owner = await store.get('s1')
    if (owner?.tenantId !== 'acme' || owner?.userId !== 'alice') {
      fail('no-overwrite', JSON.stringify(owner))
    }
  })

  // 6. get of an unknown session is undefined.
  await withStore(factory, async (store) => {
    const owner = await store.get('missing')
    if (owner !== undefined) fail('unknown-get', JSON.stringify(owner))
  })

  // 7. get returns the claimed owner.
  await withStore(factory, async (store) => {
    await store.claim('s1', alice)
    const owner = await store.get('s1')
    if (owner?.tenantId !== 'acme' || owner?.userId !== 'alice') {
      fail('get-after-claim', JSON.stringify(owner))
    }
  })

  // 8. concurrent claims resolve atomically to exactly one owner.
  await withStore(factory, async (store) => {
    const results = await Promise.allSettled([store.claim('s1', alice), store.claim('s1', bob)])
    const outcomes = results.map(r => (r.status === 'fulfilled' ? r.value : 'rejected'))
    const created = outcomes.filter(o => o === 'created').length
    const conflict = outcomes.filter(o => o === 'conflict').length
    if (created !== 1 || conflict !== 1) fail('atomic-concurrency', JSON.stringify(outcomes))
    if ((await store.get('s1')) === undefined) fail('atomic-owner', 'no owner after concurrent claim')
  })
}
