import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SQLiteDomainRepository } from '../../src/domain/sqlite.ts'
import { DomainRuntimeCoordinator } from '../../src/runtime/coordinator.ts'
import type { RuntimeHandle, RuntimeProvider, RuntimeReady, RuntimeSpec } from '../../src/runtime/provider.ts'

const alice = { tenantId: 'acme', principalId: 'alice' }
const bob = { tenantId: 'acme', principalId: 'bob' }
const version = '0.1.5-rc.2'
const cleanups: (() => Promise<unknown> | void)[] = []
afterEach(async () => {
  const results = await Promise.allSettled(cleanups.splice(0).reverse().map(cleanup => cleanup()))
  const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
  if (errors.length) throw new AggregateError(errors, 'Test cleanup failed')
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

class ControlledProvider implements RuntimeProvider {
  readonly starts: { spec: RuntimeSpec; ready: ReturnType<typeof deferred<RuntimeReady>>;
    exit: ReturnType<typeof deferred<void>>; stops: number; failStop: boolean }[] = []
  automatic = true
  acquire(spec: RuntimeSpec): RuntimeHandle {
    const start = { spec, ready: deferred<RuntimeReady>(), exit: deferred<void>(), stops: 0, failStop: false }
    this.starts.push(start)
    if (this.automatic) start.ready.resolve({ ...spec, endpoint: 'http://127.0.0.1:3081' })
    return {
      ready: start.ready.promise,
      exited: start.exit.promise,
      stop: async () => {
        start.stops++
        if (start.failStop) throw new Error('Injected release failure')
      },
    }
  }
}

async function setup(provider = new ControlledProvider(), startup = 1_000, stop = 1_000) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-wp2-'))
  const repository = new SQLiteDomainRepository(directory)
  const coordinator = new DomainRuntimeCoordinator(repository, provider, version, startup, stop)
  cleanups.push(async () => { await coordinator.close(); await rm(directory, { recursive: true, force: true }) })
  return { directory, repository, coordinator, provider }
}

describe('Domain directory and runtime ownership', () => {
  it('deduplicates verified recovery and prevents a replacement until recovery commits', async () => {
    const recovered = deferred<void>()
    let attempts = 0
    const provider = Object.assign(new ControlledProvider(), { recover: async () => { attempts++; await recovered.promise } })
    const { coordinator, repository } = await setup(provider)
    const record = repository.resolve(alice)
    repository.begin(record.id)
    const first = coordinator.recover(record.id)
    expect(coordinator.recover(record.id)).toBe(first)
    await expect(coordinator.ensure(alice)).rejects.toThrow('recovering')
    recovered.resolve()
    await first
    expect(attempts).toBe(1)
    expect(repository.get(record.id).unresolved).toBe(false)
    expect((await coordinator.ensure(alice)).generation).toBe(2)
  })

  it('retains quarantine when the provider cannot prove recovery', async () => {
    const provider = Object.assign(new ControlledProvider(), { recover: async () => { throw new Error('unverified owner') } })
    const { coordinator, repository } = await setup(provider)
    const record = repository.resolve(alice)
    repository.begin(record.id)
    await expect(coordinator.recover(record.id)).rejects.toThrow('unverified owner')
    expect(repository.get(record.id).unresolved).toBe(true)
    await expect(coordinator.ensure(alice)).rejects.toThrow('verified runtime recovery')
  })

  it('uses tuple identity, persists desired state and generation, and rejects another coordinator', async () => {
    const { directory, repository, coordinator } = await setup()
    const a = repository.resolve(alice)
    expect(repository.resolve(alice).id).toBe(a.id)
    expect(repository.resolve(bob).id).not.toBe(a.id)
    expect(repository.resolve({ tenantId: 'other', principalId: 'alice' }).id).not.toBe(a.id)
    expect(repository.resolve({ tenantId: 'a:b', principalId: 'c' }).id)
      .not.toBe(repository.resolve({ tenantId: 'a', principalId: 'b:c' }).id)
    expect(() => new SQLiteDomainRepository(directory)).toThrow('Cannot acquire')
    const first = await coordinator.ensure(alice)
    await coordinator.setDesired(a.id, 'suspended')
    expect(first.signal.aborted).toBe(true)
    await expect(coordinator.ensure(alice)).rejects.toThrow('not enabled')
    await coordinator.close()
    const reopened = new SQLiteDomainRepository(directory)
    try {
      expect(reopened.resolve(alice)).toMatchObject({ id: a.id, generation: 1, revision: 1, desired: 'suspended', unresolved: false })
      reopened.setDesired(a.id, 'revoked')
      expect(() => reopened.setDesired(a.id, 'enabled')).toThrow('cannot be re-enabled')
    } finally { reopened.close() }
  })

  it('deduplicates concurrent startup, invalidates old leases, and increments durable generations', async () => {
    const { coordinator, repository, provider } = await setup()
    const admissions = await Promise.all(Array.from({ length: 40 }, () => coordinator.ensure(alice)))
    expect(provider.starts).toHaveLength(1)
    expect(new Set(admissions)).toHaveProperty('size', 1)
    const a = admissions[0]!
    const b = await coordinator.ensure(bob)
    await coordinator.stop(a.domainId)
    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(false)
    const next = await coordinator.ensure(alice)
    expect(next.generation).toBe(a.generation + 1)
    expect(repository.get(next.domainId).state).toBe('ready')
    await Promise.all([coordinator.stop(next.domainId), coordinator.stop(next.domainId)])
    expect(provider.starts[2]!.stops).toBe(1)
  })

  it('rejects wrong readiness identity and cleans the acquired handle', async () => {
    const provider = new ControlledProvider()
    provider.automatic = false
    const { coordinator, repository } = await setup(provider)
    const start = coordinator.ensure(alice)
    const rejection = expect(start).rejects.toThrow('identity mismatch')
    await Promise.resolve()
    const acquired = provider.starts[0]!
    acquired.ready.resolve({ ...acquired.spec, generation: 999, endpoint: 'http://127.0.0.1:3000' })
    await rejection
    expect(acquired.stops).toBe(1)
    expect(repository.resolve(alice)).toMatchObject({ state: 'failed', unresolved: false })
  })

  it('times out startup, retains failed cleanup ownership, and lets other domains run', async () => {
    const provider = new ControlledProvider()
    provider.automatic = false
    const { coordinator, repository } = await setup(provider, 25)
    const start = coordinator.ensure(alice)
    const rejection = expect(start).rejects.toThrow('startup and cleanup failed')
    await Promise.resolve()
    const acquired = provider.starts[0]!
    acquired.failStop = true
    await rejection
    const error = await start.catch(error => error) as AggregateError
    expect(error.errors[0]).toHaveProperty('message', 'Runtime operation timed out')
    expect((error.errors[1] as AggregateError).errors[0]).toHaveProperty('message', 'Injected release failure')
    const a = repository.resolve(alice)
    expect(a).toMatchObject({ state: 'failed', unresolved: true })
    await expect(coordinator.ensure(alice)).rejects.toThrow('awaiting cleanup')
    provider.automatic = true
    expect((await coordinator.ensure(bob)).signal.aborted).toBe(false)
    acquired.failStop = false
    await coordinator.stop(a.id)
    expect(repository.get(a.id).unresolved).toBe(false)
  })

  it('persists revocation before cancelling a start and disposes late acquisition before releasing ownership', async () => {
    const acquired = deferred<void>()
    const ready = deferred<RuntimeReady>()
    let releases = 0
    const provider: RuntimeProvider = {
      acquire: () => ({ ready: ready.promise, exited: new Promise(() => {}), stop: async () => {
        await acquired.promise
        releases++
      } }),
    }
    const directory = await mkdtemp(join(tmpdir(), 'dsh-wp2-late-'))
    const repository = new SQLiteDomainRepository(directory)
    const coordinator = new DomainRuntimeCoordinator(repository, provider, version)
    cleanups.push(async () => { acquired.resolve(); await coordinator.close(); await rm(directory, { recursive: true, force: true }) })
    const start = coordinator.ensure(alice)
    const rejection = expect(start).rejects.toThrow('stopped')
    await Promise.resolve()
    const id = repository.resolve(alice).id
    const revoke = coordinator.setDesired(id, 'revoked')
    expect(repository.get(id).desired).toBe('revoked')
    expect(repository.get(id).unresolved).toBe(true)
    await expect(coordinator.ensure(alice)).rejects.toThrow('not enabled')
    expect(releases).toBe(0)
    acquired.resolve()
    await Promise.all([revoke, rejection])
    expect(releases).toBe(1)
    expect(repository.get(id).unresolved).toBe(false)
  })

  it('quarantines unclean durable ownership after reopening instead of trusting stale ready state', async () => {
    const { directory, repository, coordinator } = await setup()
    const a = repository.resolve(alice)
    const started = repository.begin(a.id)
    repository.ready(a.id, started.generation)
    await coordinator.close()
    const restarted = new SQLiteDomainRepository(directory)
    try {
      expect(restarted.get(a.id)).toMatchObject({ state: 'failed', unresolved: true })
      expect(() => restarted.begin(a.id)).toThrow('verified runtime recovery')
      expect(restarted.begin(restarted.resolve(bob).id).state).toBe('starting')
    } finally { restarted.close() }
  })

  it('shutdown attempts every domain, aggregates failures and retains the coordinator lock for retry', async () => {
    const { directory, coordinator, provider } = await setup()
    const a = await coordinator.ensure(alice)
    const b = await coordinator.ensure(bob)
    provider.starts[0]!.failStop = true
    const close = coordinator.close()
    expect(coordinator.close()).toBe(close)
    await expect(close).rejects.toThrow('shutdown failed')
    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(true)
    expect(provider.starts[1]!.stops).toBe(1)
    expect(() => new SQLiteDomainRepository(directory)).toThrow('Cannot acquire')
    await expect(coordinator.ensure(bob)).rejects.toThrow('closing')
    provider.starts[0]!.failStop = false
    await coordinator.close()
    const fresh = new SQLiteDomainRepository(directory)
    fresh.close()
  })

  it('invalidates admissions on unexpected exit and releases before admitting a replacement', async () => {
    const { coordinator, repository, provider } = await setup()
    const first = await coordinator.ensure(alice)
    provider.starts[0]!.exit.resolve()
    await expect.poll(() => first.signal.aborted).toBe(true)
    await expect.poll(() => repository.get(first.domainId).unresolved).toBe(false)
    expect((await coordinator.ensure(alice)).generation).toBe(2)
  })

  it('does not acquire if shutdown cancels a queued start before it runs', async () => {
    const { coordinator, provider } = await setup()
    const start = coordinator.ensure(alice)
    const rejected = expect(start).rejects.toThrow()
    const stop = coordinator.close()
    await Promise.all([stop, rejected])
    expect(provider.starts).toHaveLength(0)
  })

  it('ignores old readiness arriving after timeout and a successful new generation', async () => {
    const provider = new ControlledProvider()
    provider.automatic = false
    const { coordinator, repository } = await setup(provider, 20)
    await expect(coordinator.ensure(alice)).rejects.toThrow('timed out')
    const old = provider.starts[0]!
    provider.automatic = true
    const next = await coordinator.ensure(alice)
    old.ready.resolve({ ...old.spec, endpoint: 'http://127.0.0.1:1234' })
    await Promise.resolve()
    expect(repository.get(next.domainId)).toMatchObject({ state: 'ready', generation: 2 })
    expect((await coordinator.ensure(alice)).endpoint).toBe(next.endpoint)
    expect(next.signal.aborted).toBe(false)
  })

  it('cleans even when persisting stopping fails, retains the error, and allows a persistence retry', async () => {
    const { coordinator, repository, provider } = await setup()
    const admission = await coordinator.ensure(alice)
    const fault = vi.spyOn(repository, 'stopping').mockImplementationOnce(() => { throw new Error('disk failure') })
    await expect(coordinator.stop(admission.domainId)).rejects.toThrow('disposal failed')
    expect(provider.starts[0]!.stops).toBe(1)
    expect(admission.signal.aborted).toBe(true)
    await expect(coordinator.ensure(alice)).rejects.toThrow('awaiting cleanup')
    fault.mockRestore()
    await coordinator.stop(admission.domainId)
    expect(provider.starts[0]!.stops).toBe(1)
    expect((await coordinator.ensure(alice)).generation).toBe(2)
  })

  it('bounds an unresponsive disposer without handing the domain to another writer', async () => {
    const disposal = deferred<void>()
    const directory = await mkdtemp(join(tmpdir(), 'dsh-wp2-stop-timeout-'))
    const repository = new SQLiteDomainRepository(directory)
    let starts = 0
    const provider: RuntimeProvider = {
      acquire: spec => {
        starts++
        return { ready: Promise.resolve({ ...spec, endpoint: 'http://127.0.0.1:3000' }),
          exited: new Promise(() => {}), stop: () => disposal.promise }
      },
    }
    const coordinator = new DomainRuntimeCoordinator(repository, provider, version, 100, 20)
    cleanups.push(async () => { disposal.resolve(); await coordinator.close(); await rm(directory, { recursive: true, force: true }) })
    const admission = await coordinator.ensure(alice)
    await expect(coordinator.stop(admission.domainId)).rejects.toThrow('disposal failed')
    expect(repository.get(admission.domainId).unresolved).toBe(true)
    await expect(coordinator.ensure(alice)).rejects.toThrow('awaiting cleanup')
    expect(starts).toBe(1)
    disposal.resolve()
    await coordinator.stop(admission.domainId)
    expect(repository.get(admission.domainId).unresolved).toBe(false)
  })
})
