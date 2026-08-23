/**
 * Executable provider contracts for dsh-multi-tenant extension points.
 *
 * Third-party providers can import this subpath and prove that they satisfy the
 * same lifecycle/isolation invariants as the reference implementations.
 *
 * @module dsh-multi-tenant/testing
 */

import { Context } from '@deepseek-ai/cordis'
import { MultiTenantService } from './service.ts'
import { InMemoryTenantSessionStore, type TenantSessionStore } from './store.ts'
import { TenantRuntimeService } from './runtime.ts'
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
  try {
    const store = await factory(ctx)
    return await fn(store)
  } finally {
    await ctx.fiber.dispose()
  }
}

/**
 * Assert that `factory` produces stores satisfying the `TenantSessionStore`
 * contract: atomic claim, idempotent same-owner claim, conflict (never
 * overwrite), `get` semantics, and atomic concurrency.
 */
export async function assertTenantSessionStoreContract(factory: TenantSessionStoreFactory): Promise<void> {
  const alice: SessionOwner = { tenantId: 'acme', userId: 'alice' }
  const bob: SessionOwner = { tenantId: 'acme', userId: 'bob' }
  const eve: SessionOwner = { tenantId: 'evilcorp', userId: 'alice' }

  await withStore(factory, async (store) => {
    const result = await store.claim('s1', alice)
    if (result !== 'created') fail('first-claim', result)
  })

  await withStore(factory, async (store) => {
    await store.claim('s1', alice)
    const result = await store.claim('s1', alice)
    if (result !== 'idempotent') fail('idempotent-reclaim', result)
  })

  await withStore(factory, async (store) => {
    await store.claim('s1', alice)
    const result = await store.claim('s1', bob)
    if (result !== 'conflict') fail('same-tenant-different-user', result)
  })

  await withStore(factory, async (store) => {
    await store.claim('s1', alice)
    const result = await store.claim('s1', eve)
    if (result !== 'conflict') fail('different-tenant', result)
  })

  await withStore(factory, async (store) => {
    await store.claim('s1', alice)
    await store.claim('s1', bob)
    const owner = await store.get('s1')
    if (owner?.tenantId !== 'acme' || owner?.userId !== 'alice') {
      fail('no-overwrite', JSON.stringify(owner))
    }
  })

  await withStore(factory, async (store) => {
    const owner = await store.get('missing')
    if (owner !== undefined) fail('unknown-get', JSON.stringify(owner))
  })

  await withStore(factory, async (store) => {
    await store.claim('s1', alice)
    const owner = await store.get('s1')
    if (owner?.tenantId !== 'acme' || owner?.userId !== 'alice') {
      fail('get-after-claim', JSON.stringify(owner))
    }
  })

  await withStore(factory, async (store) => {
    const results = await Promise.allSettled([store.claim('s1', alice), store.claim('s1', bob)])
    const outcomes = results.map(r => (r.status === 'fulfilled' ? r.value : 'rejected'))
    const created = outcomes.filter(o => o === 'created').length
    const conflict = outcomes.filter(o => o === 'conflict').length
    if (created !== 1 || conflict !== 1) fail('atomic-concurrency', JSON.stringify(outcomes))
    if ((await store.get('s1')) === undefined) fail('atomic-owner', 'no owner after concurrent claim')
  })
}

/** Runtime level at which a capability provider claims isolation. */
export type RuntimeCapabilityLevel = 'tenant' | 'principal'

/**
 * Adapter used by the conformance harness to exercise a real provider with
 * distinguishable A/B configurations without knowing its implementation type.
 */
export interface RuntimeCapabilityProviderProbe {
  /** Cordis service name isolated by the provider. */
  readonly serviceName: string
  /** Tenant-wide or principal-local provider contract. */
  readonly level: RuntimeCapabilityLevel
  /** Mount/configure the provider below the supplied unpublished scope. */
  mount(ctx: Context, marker: string): void | PromiseLike<void>
  /** Return a stable marker proving which provider instance this context resolves. */
  fingerprint(ctx: Context): string | undefined | PromiseLike<string | undefined>
}

function capabilityFail(clause: string, detail: unknown): never {
  throw new Error(`Runtime capability provider contract violation (${clause}): ${String(detail)}`)
}

async function createContractRuntime(): Promise<{ ctx: Context; runtime: TenantRuntimeService }> {
  const ctx = new Context()
  await ctx.plugin(InMemoryTenantSessionStore)
  await ctx.plugin(MultiTenantService)
  await ctx.plugin(TenantRuntimeService)
  return { ctx, runtime: ctx.tenantRuntime }
}

/**
 * Prove that a provider is safe to compose at its declared runtime level.
 *
 * The contract checks same-name A/B isolation, inheritance to descendants,
 * sibling non-interference, teardown isolation, and clean recreation. Mounting
 * occurs inside the unpublished setup transaction, so a provider that cannot
 * be lifecycle-owned by the scope fails the intended usage model naturally.
 */
export async function assertRuntimeCapabilityProviderContract(
  probe: RuntimeCapabilityProviderProbe,
): Promise<void> {
  if (probe.serviceName.length === 0 || probe.serviceName !== probe.serviceName.trim()) {
    capabilityFail('service-name', 'serviceName must be a non-empty trimmed string')
  }

  const { ctx, runtime } = await createContractRuntime()
  try {
    if (probe.level === 'tenant') {
      const tenantA = await runtime.tenants.ensure('contract-a', {
        isolateServices: [probe.serviceName],
        setup: async ({ ctx: tenantCtx }) => { await probe.mount(tenantCtx, 'A') },
      })
      const tenantB = await runtime.tenants.ensure('contract-b', {
        isolateServices: [probe.serviceName],
        setup: async ({ ctx: tenantCtx }) => { await probe.mount(tenantCtx, 'B') },
      })

      if (await probe.fingerprint(tenantA.ctx) !== 'A') capabilityFail('tenant-a', 'wrong provider instance')
      if (await probe.fingerprint(tenantB.ctx) !== 'B') capabilityFail('tenant-b', 'wrong provider instance')
      if (await probe.fingerprint(ctx) !== undefined) capabilityFail('root-leak', 'tenant capability visible at root')

      const principalA = await tenantA.principals.ensure('alice')
      if (await probe.fingerprint(principalA.ctx) !== 'A') {
        capabilityFail('descendant-inheritance', 'principal did not inherit tenant provider')
      }

      await tenantA.dispose()
      if (await probe.fingerprint(tenantB.ctx) !== 'B') {
        capabilityFail('tenant-disposal-isolation', 'disposing A affected B')
      }

      const tenantA2 = await runtime.tenants.ensure('contract-a', {
        isolateServices: [probe.serviceName],
        setup: async ({ ctx: tenantCtx }) => { await probe.mount(tenantCtx, 'A2') },
      })
      if (await probe.fingerprint(tenantA2.ctx) !== 'A2') {
        capabilityFail('tenant-recreation', 'recreated tenant resolved stale provider state')
      }
      await tenantA2.dispose()
      await tenantB.dispose()
      return
    }

    const tenant = await runtime.tenants.ensure('contract-tenant')
    const alice = await tenant.principals.ensure('alice', {
      isolateServices: [probe.serviceName],
      setup: async ({ ctx: principalCtx }) => { await probe.mount(principalCtx, 'A') },
    })
    const bob = await tenant.principals.ensure('bob', {
      isolateServices: [probe.serviceName],
      setup: async ({ ctx: principalCtx }) => { await probe.mount(principalCtx, 'B') },
    })

    if (await probe.fingerprint(alice.ctx) !== 'A') capabilityFail('principal-a', 'wrong provider instance')
    if (await probe.fingerprint(bob.ctx) !== 'B') capabilityFail('principal-b', 'wrong provider instance')
    if (await probe.fingerprint(tenant.ctx) !== undefined) {
      capabilityFail('tenant-leak', 'principal capability visible at tenant level')
    }

    await alice.dispose()
    if (await probe.fingerprint(bob.ctx) !== 'B') {
      capabilityFail('principal-disposal-isolation', 'disposing Alice affected Bob')
    }

    const alice2 = await tenant.principals.ensure('alice', {
      isolateServices: [probe.serviceName],
      setup: async ({ ctx: principalCtx }) => { await probe.mount(principalCtx, 'A2') },
    })
    if (await probe.fingerprint(alice2.ctx) !== 'A2') {
      capabilityFail('principal-recreation', 'recreated principal resolved stale provider state')
    }
    await tenant.dispose()
  } finally {
    await ctx.fiber.dispose()
  }
}
