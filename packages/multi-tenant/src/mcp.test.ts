import { describe, expect, it } from 'vitest'
import {
  normalizeTenantMcpConfig,
  runtimeMcpServerName,
} from './mcp.ts'

describe('M5 Tenant MCP configuration', () => {
  it('normalizes immutable stdio and HTTP server definitions', () => {
    const config = normalizeTenantMcpConfig({
      servers: [
        {
          transport: 'stdio',
          serverName: 'erp',
          command: 'node',
          args: ['server.mjs'],
          env: { TENANT: 'acme' },
          credentialEnv: { TOKEN: { credential: 'erpToken', prefix: 'Bearer ' } },
        },
        {
          transport: 'streamable-http',
          serverName: 'search',
          url: 'https://example.test/mcp',
          headers: { 'X-Tenant': 'acme' },
          credentialHeaders: { Authorization: { credential: 'searchToken', prefix: 'Bearer ' } },
        },
      ],
    })

    expect(config.servers).toHaveLength(2)
    expect(config.servers[0]?.toolCallTimeoutMs).toBe(60_000)
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.servers)).toBe(true)
    expect(Object.isFrozen(config.servers[0])).toBe(true)
  })

  it('fails duplicate logical names and static/credential collisions before traffic', () => {
    expect(() => normalizeTenantMcpConfig({
      servers: [
        { transport: 'stdio', serverName: 'erp', command: 'node' },
        { transport: 'stdio', serverName: 'erp', command: 'node' },
      ],
    })).toThrow(/duplicate MCP serverName/)

    expect(() => normalizeTenantMcpConfig({
      servers: [{
        transport: 'streamable-http',
        serverName: 'erp',
        url: 'https://example.test/mcp',
        headers: { Authorization: 'static' },
        credentialHeaders: { Authorization: { credential: 'token' } },
      }],
    })).toThrow(/cannot be both static and credential-bound/)
  })
})

describe('M5 runtime MCP namespace', () => {
  const alice = { tenantId: 'acme', userId: 'alice' }

  it('is deterministic across resume of the same Principal Session', () => {
    const first = runtimeMcpServerName('erp', alice, 'session-1')
    const resumed = runtimeMcpServerName('erp', alice, 'session-1')
    expect(resumed).toBe(first)
    expect(first).toMatch(/^[A-Za-z0-9_-]{1,32}$/)
  })

  it('separates sessions and principals so upstream root-wide reservations do not collide normally', () => {
    const aliceOne = runtimeMcpServerName('erp', alice, 'session-1')
    const aliceTwo = runtimeMcpServerName('erp', alice, 'session-2')
    const bobOne = runtimeMcpServerName('erp', { tenantId: 'acme', userId: 'bob' }, 'session-1')
    const globexAlice = runtimeMcpServerName('erp', { tenantId: 'globex', userId: 'alice' }, 'session-1')

    expect(new Set([aliceOne, aliceTwo, bobOne, globexAlice]).size).toBe(4)
  })
})
