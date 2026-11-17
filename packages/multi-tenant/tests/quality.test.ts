import { test, expect, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { get } from 'node:http'
import { parseEnvironmentOwner, identities, type AgentEnvironmentRuntime, type EnvironmentConnection } from '@dsh/environment-connector-internal'
import { parseConfiguration, parseMembership } from '../src/platform/configuration.ts'
import { EnvironmentBindingStore } from '../src/platform/bindings.ts'
import { createPlatformApplication } from '../src/platform/application.ts'
import { createPlatformIngress } from '../src/platform/ingress.ts'
import { createEnvironmentControl } from '../src/platform/control.ts'
import { listenAdmin } from '../src/platform/admin.ts'
import { listenServer } from '../src/platform/work.ts'
import { diagnostic } from '../src/platform/errors.ts'
import { environmentId } from '../src/platform/identity.ts'

const owner = parseEnvironmentOwner({ tenantId: ' tenant ', principalId: '汉字' })
const member = { issuer: 'https://issuer.test', subject: 'exact subject ', owner }
const configValue = {
  runtime: { kubernetes: { server: 'https://cluster.test', caFile: '/ca', tokenFile: '/token' },
    namespacePrefix: 'env', platformNamespace: 'platform', domain: 'env.example.test', image: `env@sha256:${'a'.repeat(64)}`,
    storage: { storageClassName: 'standard', size: '1Gi' },
    resources: { requests: { cpu: '100m', memory: '256Mi' }, limits: { cpu: '1', memory: '1Gi' } } },
  stateFile: '/private/state.sqlite', adminSocket: '/private/admin.sock',
  oidc: { issuer: member.issuer, clientId: 'client', platformOrigin: 'https://platform.example.test', siteDomain: 'example.test' },
  members: [member], host: '127.0.0.1', port: 12345,
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('Deferred not initialized') }
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const runtime: AgentEnvironmentRuntime = {
  create: vi.fn(), inspectAllocation: vi.fn(), inspect: vi.fn(), connect: vi.fn(), stop: vi.fn(), start: vi.fn(), delete: vi.fn(),
}

test('configuration schemas reject nested coercion, unknown fields and ambiguous membership; identity remains exact', () => {
  expect(parseConfiguration(configValue).members[0]?.owner).toEqual(owner)
  expect(parseMembership({ members: [member], other: 'requires restart' }, member.issuer)).toEqual([member])
  for (const change of [
    { runtime: { ...configValue.runtime, resources: { requests: { cpu: 1, memory: '1Gi' } } } },
    { oidc: { ...configValue.oidc, clientSecret: 'must not be inline' } },
    { members: [member, member] },
    { members: [{ ...member, issuer: 'https://other.test' }] },
    { port: '12345' },
  ]) expect(() => parseConfiguration({ ...configValue, ...change })).toThrow()
})

test.each(['json', 'owner', 'phase', 'ref', 'pending', 'coercion', 'id'])(
  'corrupt persisted %s poisons writes without replacing allocation', (kind) => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-db-'))
    const filename = join(directory, 'state.sqlite')
    let store = new EnvironmentBindingStore(filename)
    const record = store.reserve(owner)
    store.close()
    const db = new DatabaseSync(filename)
    const encoded = kind === 'json' ? '{private-malformed-record' : JSON.stringify({ ...record,
      ...(kind === 'owner' ? { owner: { ...owner, principalId: 'different' } } : {}),
      ...(kind === 'phase' ? { phase: 'bound' } : {}),
      ...(kind === 'pending' ? { pending: 'stop' } : {}),
      ...(kind === 'coercion' ? { allocationKey: 42 } : {}),
      ...(kind === 'id' ? { id: 'env-other' } : {}),
      ...(kind === 'ref' ? { phase: 'bound', ref: {
        allocationKey: record.allocationKey, owner: { ...owner, tenantId: 'other' }, namespace: 'ns',
        sandbox: { name: 'environment', uid: 'sb' }, data: { name: 'data', uid: 'pvc' },
      } } : {}),
    })
    db.prepare('UPDATE bindings SET record=? WHERE id=?').run(encoded, record.id)
    db.close()
    store = new EnvironmentBindingStore(filename)
    try {
      let failure: unknown
      try { store.get(record.id) } catch (cause) { failure = cause }
      expect(diagnostic(failure, 'db').code).toBe('StateUnavailable')
      expect(failure).toHaveProperty('cause')
      expect(() => store.reserve(parseEnvironmentOwner({ tenantId: 'other', principalId: 'owner' }))).toThrow('StateUnavailable')
      expect(JSON.stringify(failure)).not.toContain(encoded)
    } finally { store.close(); rmSync(directory, { recursive: true }) }
  },
)

test.each(['authentication', 'connect'] as const)('ingress close waits for actual pending %s settlement', async (stage) => {
  const admitted = deferred<void>()
  const finished = deferred<void>()
  const session = { environmentId: environmentId('env'), owner, signal: new AbortController().signal }
  const ref = { allocationKey: identities.allocationKey('key'), owner, namespace: identities.namespace('ns'),
    sandbox: { name: 'environment', uid: identities.sandboxUID('sb') }, data: { name: 'data', uid: identities.pvcUID('pvc') } }
  const forward = vi.fn()
  const connection: EnvironmentConnection = { origin: 'https://env.test', forward, upgrade: vi.fn() }
  const app = createPlatformIngress({ ...runtime, async connect() {
    if (stage === 'connect') { admitted.resolve(); await finished.promise }
    return connection
  } }, { async authenticate() {
    if (stage === 'authentication') { admitted.resolve(); await finished.promise }
    return session
  } }, new Map([[session.environmentId, { id: session.environmentId, owner, instance: ref }]]))
  const lifecycle = new AbortController()
  await listenServer(app.server, { host: '127.0.0.1', port: 0, signal: lifecycle.signal })
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('Missing TCP address')
  const request = get(`http://127.0.0.1:${address.port}`)
  request.on('error', () => {})
  try {
    await admitted.promise
    const close = app.close()
    expect(app.close()).toBe(close)
    let closed = false
    void close.then(() => { closed = true })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(closed).toBe(false)
    finished.resolve()
    await close
    expect(forward).not.toHaveBeenCalled()
  } finally { finished.resolve(); request.destroy(); await app.close() }
})

test('startup cancellation waits for late authentication acquisition and releases the SQLite lock exactly once', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-app-'))
  const config = parseConfiguration({ ...configValue, stateFile: join(directory, 'state.sqlite'), adminSocket: join(directory, 'admin.sock') })
  const auth = { authenticator: { authenticate: vi.fn() }, updateMembers: vi.fn(), close: vi.fn() }
  const waiting = deferred<typeof auth>()
  const app = createPlatformApplication(config, undefined, {
    createAgentEnvironmentRuntime: () => runtime, openStore: path => new EnvironmentBindingStore(path), createEnvironmentControl,
    createOIDCAuthentication: () => waiting.promise, createPlatformIngress, listenAdmin, listenServer,
  })
  const started = app.start().catch((cause: unknown) => cause)
  const close = app.close()
  expect(app.close()).toBe(close)
  expect(() => new EnvironmentBindingStore(config.stateFile)).toThrow()
  waiting.resolve(auth)
  await started
  await close
  expect(auth.close).toHaveBeenCalledTimes(1)
  const reopened = new EnvironmentBindingStore(config.stateFile)
  reopened.close()
  rmSync(directory, { recursive: true })
})

test('shutdown awaits membership reload and never installs late membership after cancellation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-reload-'))
  const config = parseConfiguration({ ...configValue, stateFile: join(directory, 'state.sqlite'), adminSocket: join(directory, 'admin.sock') })
  const auth = { authenticator: { authenticate: vi.fn() }, updateMembers: vi.fn(), close: vi.fn() }
  const input = deferred<unknown>()
  const app = createPlatformApplication(config, undefined, {
    createAgentEnvironmentRuntime: () => runtime, openStore: path => new EnvironmentBindingStore(path), createEnvironmentControl,
    createOIDCAuthentication: async () => auth, createPlatformIngress, listenAdmin, listenServer: async () => {},
  })
  try {
    await app.start()
    expect(await app.reload(async () => ({ members: [{ ...member, issuer: 'wrong' }] }))).toBe(false)
    expect(auth.updateMembers).toHaveBeenLastCalledWith([])
    auth.updateMembers.mockClear()
    const reload = app.reload(() => input.promise)
    const close = app.close()
    expect(auth.close).not.toHaveBeenCalled()
    input.resolve({ members: [member] })
    await reload
    await close
    expect(auth.updateMembers).not.toHaveBeenCalled()
    expect(auth.close).toHaveBeenCalledTimes(1)
  } finally { input.resolve({ members: [] }); await app.close(); rmSync(directory, { recursive: true }) }
})

test('admin shutdown drains a late runtime read before releasing private storage', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-admin-'))
  const config = parseConfiguration({ ...configValue, stateFile: join(directory, 'state.sqlite'), adminSocket: join(directory, 'admin.sock') })
  const store = new EnvironmentBindingStore(config.stateFile)
  const record = store.reserve(owner)
  store.save({ ...record, phase: 'submitted' }, 'pending')
  const released = vi.spyOn(store, 'close')
  const admitted = deferred<void>(), finished = deferred<null>()
  const app = createPlatformApplication(config, undefined, {
    createAgentEnvironmentRuntime: () => ({ ...runtime, async inspectAllocation() { admitted.resolve(); return finished.promise } }),
    openStore: () => store, createEnvironmentControl,
    createOIDCAuthentication: async () => ({ authenticator: { authenticate: vi.fn() }, updateMembers: vi.fn(), close: vi.fn() }),
    createPlatformIngress, listenAdmin, listenServer: async () => {},
  })
  await app.start()
  const request = get({ socketPath: config.adminSocket, path: `/inspect/${record.id}` })
  request.on('error', () => {})
  try {
    await admitted.promise
    const close = app.close()
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(released).not.toHaveBeenCalled()
    expect(store.get(record.id)?.phase).toBe('submitted')
    finished.resolve(null)
    await close
    expect(released).toHaveBeenCalledTimes(1)
  } finally { finished.resolve(null); request.destroy(); await app.close(); rmSync(directory, { recursive: true }) }
})

test('partial startup and authentication cleanup failures still close ingress and release storage', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-failure-'))
  const config = parseConfiguration({ ...configValue, stateFile: join(directory, 'state.sqlite'), adminSocket: join(directory, 'admin.sock') })
  const startupCause = new Error('admin binding failed')
  const cleanupCause = new Error('authentication disposal failed')
  const app = createPlatformApplication(config, undefined, {
    createAgentEnvironmentRuntime: () => runtime, openStore: path => new EnvironmentBindingStore(path), createEnvironmentControl,
    createOIDCAuthentication: async () => ({
      authenticator: { authenticate: vi.fn() }, updateMembers: vi.fn(), close() { throw cleanupCause },
    }),
    createPlatformIngress, listenAdmin: async () => { throw startupCause }, listenServer,
  })
  try {
    await expect(app.start()).rejects.toMatchObject({ errors: [startupCause, expect.any(AggregateError)] })
    await expect(app.close()).rejects.toMatchObject({ errors: [cleanupCause] })
    const reopened = new EnvironmentBindingStore(config.stateFile)
    reopened.close()
  } finally { rmSync(directory, { recursive: true }) }
})
