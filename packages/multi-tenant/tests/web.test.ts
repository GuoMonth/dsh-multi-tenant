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
import type { MultiTenantService } from '../src/service.ts'
import type { AgentId, PrincipalContext, TenantAgent } from '../src/types.ts'
import { mountMultiTenantWeb } from '../src/web.ts'

interface Route {
  readonly kind: 'exact' | 'prefix'
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  await Promise.allSettled(cleanups.splice(0).map(cleanup => cleanup()))
})

async function webHarness() {
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
  let createFailure: Error | undefined
  let deleted = false
  let createCalls = 0
  let lastPrincipal: PrincipalContext | undefined
  const service = {
    async create(principal: PrincipalContext): Promise<TenantAgent> {
      assertPrincipalContext(principal)
      lastPrincipal = principal
      createCalls += 1
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
    setCreateFailure(error: Error | undefined) { createFailure = error },
    get createCalls() { return createCalls },
    get lastPrincipal() { return lastPrincipal },
  }
}

const authenticated = { authorization: 'Bearer alice' }

describe('authenticated Web adapter', () => {
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
