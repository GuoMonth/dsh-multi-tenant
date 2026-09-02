import { describe, expect, it } from 'vitest'
import {
  assertPrincipalContext,
  createPrincipalContext,
  ValidationError,
} from '../src/index.ts'
import {
  normalizeTenantMcpSnapshot,
  requiredSecretNames,
  resolveMcpServers,
} from '../src/mcp.ts'

describe('PrincipalContext authority', () => {
  it('mints a frozen server object that a wire-shaped object cannot impersonate', () => {
    const principal = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
    expect(Object.isFrozen(principal)).toBe(true)
    expect(() => assertPrincipalContext(principal)).not.toThrow()
    expect(() => assertPrincipalContext({ tenantId: 'acme', principalId: 'alice' })).toThrow(ValidationError)
    expect(() => assertPrincipalContext(JSON.parse(JSON.stringify(principal)))).toThrow(ValidationError)
  })

  it('rejects ambiguous identity values', () => {
    expect(() => createPrincipalContext({ tenantId: ' acme', principalId: 'alice' })).toThrow(ValidationError)
    expect(() => createPrincipalContext({ tenantId: 'acme', principalId: '' })).toThrow(ValidationError)
  })
})

describe('tenant MCP declarations', () => {
  it('preserves the raw logical serverName and materializes secrets only into a runtime config', () => {
    const snapshot = normalizeTenantMcpSnapshot({
      revision: 'mcp-r1',
      servers: [{
        transport: 'streamable-http',
        serverName: 'github',
        url: 'https://mcp.example.test',
        headers: { accept: 'application/json' },
        secretHeaders: { authorization: { secret: 'github-token', prefix: 'Bearer ' } },
      }],
    })
    expect(requiredSecretNames(snapshot)).toEqual(['github-token'])
    const resolved = resolveMcpServers(snapshot, {
      revision: 'secret-r1',
      values: { 'github-token': 'top-secret' },
      signal: new AbortController().signal,
      dispose() {},
    })
    expect(resolved).toEqual([expect.objectContaining({
      serverName: 'github',
      headers: { accept: 'application/json', authorization: 'Bearer top-secret' },
    })])
    expect(JSON.stringify(snapshot)).not.toContain('top-secret')
  })

  it('supports the same logical name in independent snapshots and rejects collisions within one Agent', () => {
    const server = { transport: 'stdio' as const, serverName: 'shared', command: 'node' }
    expect(normalizeTenantMcpSnapshot({ revision: 'a', servers: [server] }).servers[0]?.serverName).toBe('shared')
    expect(normalizeTenantMcpSnapshot({ revision: 'b', servers: [server] }).servers[0]?.serverName).toBe('shared')
    expect(() => normalizeTenantMcpSnapshot({ revision: 'bad', servers: [server, server] })).toThrow(ValidationError)
  })

  it('fails closed when a required secret is absent or a lease is revoked', () => {
    const snapshot = normalizeTenantMcpSnapshot({
      revision: 'mcp-r1',
      servers: [{
        transport: 'stdio',
        serverName: 'private',
        command: 'node',
        secretEnv: { API_TOKEN: { secret: 'token' } },
      }],
    })
    expect(() => resolveMcpServers(snapshot, {
      revision: 'missing',
      values: {},
      signal: new AbortController().signal,
      dispose() {},
    })).toThrow('Required secret')
    const controller = new AbortController()
    controller.abort()
    expect(() => resolveMcpServers(snapshot, {
      revision: 'revoked',
      values: { token: 'never-used' },
      signal: controller.signal,
      dispose() {},
    })).toThrow()
  })
})
