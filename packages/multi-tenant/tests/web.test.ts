import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AgentNotFoundError,
  AgentProvisioningError,
  assertPrincipalContext,
  CapabilityUnavailableError,
  createPrincipalContext,
  parseAgentId,
} from '../src/index.ts'
import { ObservationQueue } from '../src/observation.ts'
import type { MultiTenantService } from '../src/service.ts'
import type { AgentId, CreateAgentOptions, PrincipalContext, TenantAgent } from '../src/types.ts'
import { mountMultiTenantWeb, type AgentProfileResolver } from '../src/web.ts'

interface Route {
  readonly kind: 'exact' | 'prefix'
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  await Promise.allSettled(cleanups.splice(0).map(cleanup => cleanup()))
})

async function webHarness(resolveAgentProfile?: AgentProfileResolver) {
  const routes: Route[] = []
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  ctx.provide('webServer', {
    register(route: Route) {
      routes.push(route)
      return () => {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
    },
  })

  const knownId = parseAgentId('123e4567-e89b-42d3-a456-426614174000')
  const known: TenantAgent = Object.freeze({
    id: knownId,
    state: 'ready',
    mcpServers: Object.freeze(['example']),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
  })
  let observationDisposals = 0
  let createFailure: Error | undefined
  let deleted = false
  let createCalls = 0
  const receivedCreateOptions: Array<CreateAgentOptions | undefined> = []
  let lastPrincipal: PrincipalContext | undefined
  const service = {
    async read() { return { items: [], cursor: `${knownId}:-1`, active: false } },
    async observe(_principal: PrincipalContext, _id: AgentId, options: { signal: AbortSignal }) {
      const queue = new ObservationQueue(() => { observationDisposals++ })
      options.signal.addEventListener('abort', () => { void queue.dispose() }, { once: true })
      queue.push({ type: 'replace', page: { items: [], cursor: `${knownId}:-1`, active: false } })
      return queue
    },
    async send(principal: PrincipalContext, id: AgentId) {
      assertPrincipalContext(principal)
      if (id !== knownId || deleted) throw new AgentNotFoundError()
      return { accepted: true }
    },
    async cancel(principal: PrincipalContext, id: AgentId) {
      assertPrincipalContext(principal)
      if (id !== knownId || deleted) throw new AgentNotFoundError()
      return { status: 'inactive' }
    },
    async create(principal: PrincipalContext, options?: CreateAgentOptions): Promise<TenantAgent> {
      assertPrincipalContext(principal)
      lastPrincipal = principal
      createCalls += 1
      receivedCreateOptions.push(options)
      if (createFailure !== undefined) throw createFailure
      return known
    },
    async list(principal: PrincipalContext): Promise<readonly TenantAgent[]> {
      assertPrincipalContext(principal)
      return deleted ? [] : [known]
    },
    async get(principal: PrincipalContext, id: AgentId): Promise<TenantAgent> {
      assertPrincipalContext(principal)
      if (id !== knownId || deleted) throw new AgentNotFoundError()
      return known
    },
    async delete(principal: PrincipalContext, id: AgentId): Promise<void> {
      assertPrincipalContext(principal)
      if (id !== knownId || deleted) throw new AgentNotFoundError()
      deleted = true
    },
  } as unknown as MultiTenantService

  const handle = mountMultiTenantWeb(ctx, service, {
    ...(resolveAgentProfile === undefined ? {} : { resolveAgentProfile }),
    principalProvider: {
      authenticate(request) {
        if (request.headers.authorization !== 'Bearer alice') return undefined
        return createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
      },
    },
  })
  cleanups.push(() => handle.dispose())

  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    const route = routes.find(candidate => candidate.kind === 'exact' && candidate.path === pathname)
      ?? routes.find(candidate => candidate.kind === 'prefix' && pathname.startsWith(`${candidate.path}/`))
    if (route === undefined) {
      res.writeHead(404).end()
      return
    }
    void Promise.resolve(route.handler(req, res)).catch(error => {
      res.writeHead(500).end(String(error))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.close(error => error === undefined ? resolve() : reject(error))
  }))
  const address = server.address()
  if (typeof address !== 'object' || address === null) throw new Error('test server has no address')
  return {
    base: `http://127.0.0.1:${address.port}/_dsh-multi-tenant`,
    knownId,
    get observationDisposals() { return observationDisposals },
    setCreateFailure(error: Error | undefined) { createFailure = error },
    get createCalls() { return createCalls },
    get receivedCreateOptions() { return receivedCreateOptions },
    get lastPrincipal() { return lastPrincipal },
  }
}

const authenticated = { authorization: 'Bearer alice' }

describe('authenticated Web adapter', () => {
  it('streams an authenticated baseline and disposes observation on HTTP disconnect', async () => {
    const test = await webHarness()
    const url = `${test.base}/agents/${test.knownId}`
    expect((await fetch(`${url}/events`)).status).toBe(401)
    expect((await fetch(`${url}/history?sessionId=forged`, { headers: authenticated })).status).toBe(400)
    const controller = new AbortController()
    const response = await fetch(`${url}/events`, { headers: authenticated, signal: controller.signal })
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const reader = response.body!.getReader()
    const frame = await reader.read()
    expect(new TextDecoder().decode(frame.value)).toContain('event: replace')
    controller.abort()
    await reader.cancel().catch(() => undefined)
    await expect.poll(() => test.observationDisposals).toBe(1)
  })
  it('admits only authenticated product messages and cancellation inputs', async () => {
    const test = await webHarness()
    const url = `${test.base}/agents/${test.knownId}`
    expect((await fetch(`${url}/messages`, { method: 'POST', body: '{"text":"hello"}' })).status).toBe(401)
    const send = await fetch(`${url}/messages`, { method: 'POST', headers: authenticated, body: '{"text":"hello","delivery":"steer"}' })
    expect(send.status).toBe(202)
    expect(await send.json()).toEqual({ accepted: true })
    for (const field of ['source', 'sessionId', 'principalId', 'agentOptions']) {
      const forged = await fetch(`${url}/messages`, { method: 'POST', headers: authenticated, body: JSON.stringify({ text: 'hello', [field]: 'forged' }) })
      expect(forged.status).toBe(400)
    }
    const cancelled = await fetch(`${url}/cancel`, { method: 'POST', headers: authenticated, body: '{}' })
    expect(await cancelled.json()).toEqual({ status: 'inactive' })
    expect((await fetch(`${url}/executeTool`, { method: 'POST', headers: authenticated })).status).toBe(404)
  })
  it('provides Agent CRUD without accepting identity or exposing internal authority', async () => {
    const test = await webHarness()
    const unauthenticated = await fetch(`${test.base}/agents`)
    expect(unauthenticated.status).toBe(401)

    const forged = await fetch(`${test.base}/agents`, {
      method: 'POST',
      headers: { ...authenticated, 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId: 'globex', principalId: 'mallory', sessionId: 'chosen' }),
    })
    expect(forged.status).toBe(400)
    expect(test.createCalls).toBe(0)

    const created = await fetch(`${test.base}/agents`, {
      method: 'POST',
      headers: { ...authenticated, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(created.status).toBe(201)
    const createdText = await created.text()
    expect(createdText).toContain(test.knownId)
    expect(createdText).not.toMatch(/session|secret|tenantId|principalId/i)
    expect(test.lastPrincipal).toEqual({ tenantId: 'acme', principalId: 'alice' })
    expect(test.receivedCreateOptions).toEqual([undefined])

    const listed = await fetch(`${test.base}/agents`, { headers: authenticated })
    expect(listed.status).toBe(200)
    expect(await listed.json()).toEqual({ agents: [expect.objectContaining({ id: test.knownId })] })

    const read = await fetch(`${test.base}/agents/${test.knownId}`, { headers: authenticated })
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual({ agent: expect.objectContaining({ id: test.knownId }) })

    const deleted = await fetch(`${test.base}/agents/${test.knownId}`, {
      method: 'DELETE', headers: authenticated,
    })
    expect(deleted.status).toBe(204)
    const missing = await fetch(`${test.base}/agents/${test.knownId}`, { headers: authenticated })
    expect(missing.status).toBe(404)
  })

  it('resolves a named profile only through the authenticated host resolver', async () => {
    let resolvedPrincipal: PrincipalContext | undefined
    const test = await webHarness((principal, profile) => {
      resolvedPrincipal = principal
      if (profile !== 'coding') return undefined
      return {
        agentOptions: { provider: 'trusted', model: 'coder', maxTokens: 4096 },
        meta: { cwd: '/srv/workspaces/alice', agentPreset: 'minimal' },
      }
    })
    const response = await fetch(`${test.base}/agents`, {
      method: 'POST',
      headers: { ...authenticated, 'content-type': 'application/json' },
      body: JSON.stringify({ profile: 'coding' }),
    })
    expect(response.status).toBe(201)
    expect(resolvedPrincipal).toEqual({ tenantId: 'acme', principalId: 'alice' })
    expect(test.receivedCreateOptions).toEqual([{
      agentOptions: { provider: 'trusted', model: 'coder', maxTokens: 4096 },
      meta: { cwd: '/srv/workspaces/alice', agentPreset: 'minimal' },
    }])
  })

  it('rejects absent and unknown profile resolvers without reaching the service', async () => {
    const withoutResolver = await webHarness()
    const unavailable = await fetch(`${withoutResolver.base}/agents`, {
      method: 'POST', headers: authenticated, body: JSON.stringify({ profile: 'coding' }),
    })
    expect(unavailable.status).toBe(400)
    expect(withoutResolver.createCalls).toBe(0)

    const unknownProfile = await webHarness(() => undefined)
    const unknown = await fetch(`${unknownProfile.base}/agents`, {
      method: 'POST', headers: authenticated, body: JSON.stringify({ profile: 'unknown' }),
    })
    expect(unknown.status).toBe(400)
    expect(unknownProfile.createCalls).toBe(0)
  })

  it('accepts no wire field other than a non-empty profile', async () => {
    const test = await webHarness(() => ({}))
    const rejectedBodies: readonly Record<string, unknown>[] = [
      { profile: '' },
      { profile: ' ' },
      { profile: 1 },
      { tenantId: 'globex' },
      { principalId: 'mallory' },
      { userId: 'mallory' },
      { sessionId: 'chosen' },
      { agentId: 'chosen' },
      { agentOptions: {} },
      { meta: {} },
      { cwd: '/tmp' },
      { preset: 'unsafe' },
      { provider: 'unsafe' },
      { parent: 'other-agent' },
      { delegation: {} },
      { unknown: true },
      { profile: 'coding', meta: { cwd: '/tmp' } },
    ]
    for (const body of rejectedBodies) {
      const response = await fetch(`${test.base}/agents`, {
        method: 'POST', headers: authenticated, body: JSON.stringify(body),
      })
      expect(response.status, JSON.stringify(body)).toBe(400)
    }
    expect(test.createCalls).toBe(0)
  })

  it('maps resolver failures and invalid trusted options to a non-leaking 503', async () => {
    const failed = await webHarness(() => { throw new Error('private resolver detail') })
    const failure = await fetch(`${failed.base}/agents`, {
      method: 'POST', headers: authenticated, body: JSON.stringify({ profile: 'coding' }),
    })
    expect(failure.status).toBe(503)
    expect(await failure.text()).not.toContain('private resolver detail')
    expect(failed.createCalls).toBe(0)

    const malformed = await webHarness(() => ({
      agentOptions: { model: 'coder', temperature: 1 } as never,
    }))
    const invalid = await fetch(`${malformed.base}/agents`, {
      method: 'POST', headers: authenticated, body: JSON.stringify({ profile: 'coding' }),
    })
    expect(invalid.status).toBe(503)
    expect(malformed.createCalls).toBe(0)
  })

  it('authenticates before parsing resource ids and applies the stable error mapping', async () => {
    const test = await webHarness()
    expect((await fetch(`${test.base}/agents/not-a-uuid`)).status).toBe(401)
    expect((await fetch(`${test.base}/agents/not-a-uuid`, { headers: authenticated })).status).toBe(400)

    const unknown = await fetch(`${test.base}/agents/123e4567-e89b-42d3-a456-426614174999`, {
      headers: authenticated,
    })
    expect(unknown.status).toBe(404)

    test.setCreateFailure(new CapabilityUnavailableError('secret token-name failed'))
    const unavailable = await fetch(`${test.base}/agents`, {
      method: 'POST', headers: { ...authenticated, 'content-type': 'application/json' }, body: '{}',
    })
    expect(unavailable.status).toBe(503)
    expect(await unavailable.text()).not.toContain('token-name')

    test.setCreateFailure(new AgentProvisioningError())
    const upstream = await fetch(`${test.base}/agents`, {
      method: 'POST', headers: { ...authenticated, 'content-type': 'application/json' }, body: '{}',
    })
    expect(upstream.status).toBe(502)
  })
})
