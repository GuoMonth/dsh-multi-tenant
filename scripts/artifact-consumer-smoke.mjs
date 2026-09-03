#!/usr/bin/env node
/** Exercise the exact public surface from an installed tarball or registry spec. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_TARGET } from './dsh-target.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const requested = process.argv[2]
if (requested === undefined) {
  console.error('usage: artifact-consumer-smoke.mjs <package-spec|--local>')
  process.exit(2)
}
const consumer = mkdtempSync(join(tmpdir(), 'dsh-mt-v04-consumer-'))
const packDirectory = requested === '--local' ? mkdtempSync(join(tmpdir(), 'dsh-mt-v04-pack-')) : undefined

function targets(value, output = []) {
  if (typeof value === 'string') output.push(value)
  else if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) targets(child, output)
  }
  return output
}

try {
  let packageSpec = requested
  if (packDirectory !== undefined) {
    execFileSync('pnpm', ['--filter', 'dsh-multi-tenant', 'build'], { cwd: root, stdio: 'ignore' })
    execFileSync('pnpm', ['--filter', 'dsh-multi-tenant', 'pack', '--pack-destination', packDirectory], {
      cwd: root,
      stdio: 'ignore',
    })
    const tarball = readdirSync(packDirectory).find(file => file.endsWith('.tgz'))
    if (tarball === undefined) throw new Error('pnpm pack produced no tarball')
    packageSpec = join(packDirectory, tarball)

    const packageJson = JSON.parse(readFileSync(join(root, 'packages/multi-tenant/package.json'), 'utf8'))
    const listing = execFileSync('tar', ['-tzf', packageSpec], { encoding: 'utf8' }).trim().split('\n')
    const has = path => listing.some(entry => entry === path || entry.endsWith(`/${path}`))
    const required = [
      'package.json', 'README.md', 'README.zh-CN.md', 'LICENSE', 'cordis.patch.yml',
      'dist/index.mjs', 'dist/mcp.mjs', 'dist/sqlite.mjs', 'dist/web.mjs',
      'dist/testing.mjs', 'dist/starter-plugin.mjs',
    ]
    const missing = required.filter(path => !has(path))
    if (missing.length > 0) throw new Error(`tarball is missing ${missing.join(', ')}`)
    const unresolved = targets(packageJson.exports)
      .map(path => path.replace(/^\.\//, ''))
      .filter(path => !has(path))
    if (unresolved.length > 0) throw new Error(`export targets missing: ${unresolved.join(', ')}`)
  }

  writeFileSync(join(consumer, 'package.json'), JSON.stringify({
    name: 'dsh-multi-tenant-v04-consumer', private: true, type: 'module',
  }))
  writeFileSync(join(consumer, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: false\n')
  execFileSync('pnpm', ['add',
    '@deepseek-ai/cordis@4.0.2',
    `@deepseek-ai/dsh-agent@${DSH_TARGET.version}`,
    `@deepseek-ai/dsh-mcp-client@${DSH_TARGET.version}`,
    `@deepseek-ai/dsh-session@${DSH_TARGET.version}`,
    `@deepseek-ai/dsh-tools@${DSH_TARGET.version}`,
    'typescript@6.0.3',
    packageSpec,
  ], { cwd: consumer, stdio: 'ignore' })

  writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2024', module: 'NodeNext', moduleResolution: 'NodeNext',
      strict: true, noEmit: true, skipLibCheck: true,
    },
    include: ['provider-contract.ts'],
  }))
  writeFileSync(join(consumer, 'provider-contract.ts'), `
    import {
      RuntimePartitionProvider, SecretProvider, TenantMcpProvider,
      type DshAgentSpecification, type PrincipalContext,
      type RuntimePartitionLease, type RuntimePartitionRequest, type SecretLease,
      type TenantMcpSnapshot,
    } from 'dsh-multi-tenant'

    export class McpProvider extends TenantMcpProvider {
      async load(_principal: PrincipalContext, signal: AbortSignal): Promise<TenantMcpSnapshot> {
        signal.throwIfAborted()
        return { revision: 'consumer-v1', servers: [] }
      }
    }
    export class Secrets extends SecretProvider {
      async acquire(
        _principal: PrincipalContext,
        _names: readonly string[],
        signal: AbortSignal,
      ): Promise<SecretLease> {
        signal.throwIfAborted()
        return { revision: 'consumer-v1', values: {}, signal, dispose() {} }
      }
    }
    export class Partitions extends RuntimePartitionProvider {
      async acquire(request: RuntimePartitionRequest): Promise<RuntimePartitionLease> {
        request.signal.throwIfAborted()
        return {
          isolation: 'logical',
          driver: {
            async create(specification: DshAgentSpecification) {
              specification.signal.throwIfAborted()
              throw new Error('type-only consumer')
            },
            async resume(specification: DshAgentSpecification) {
              specification.signal.throwIfAborted()
              throw new Error('type-only consumer')
            },
          },
          dispose() {},
        }
      }
    }
  `)
  execFileSync('pnpm', ['exec', 'tsc'], { cwd: consumer, stdio: 'ignore' })

  writeFileSync(join(consumer, 'smoke.mjs'), `
    import { Context } from '@deepseek-ai/cordis'
    import {
      AgentNotFoundError,
      createPrincipalContext,
      EmptyTenantMcpProvider,
      InMemoryTenantAgentRepository,
      MultiTenantService,
      RuntimePartitionProvider,
      UnavailableSecretProvider,
    } from 'dsh-multi-tenant'
    import * as Mcp from 'dsh-multi-tenant/mcp'
    import SQLiteRepository from 'dsh-multi-tenant/sqlite'
    import * as Web from 'dsh-multi-tenant/web'
    import * as Testing from 'dsh-multi-tenant/testing'
    import * as Starter from 'dsh-multi-tenant/starter'

    const assert = (condition, message) => { if (!condition) throw new Error(message) }
    assert(typeof Mcp.TenantMcpProvider === 'function', 'MCP provider export missing')
    assert(typeof Web.mountMultiTenantWeb === 'function', 'Web export missing')
    assert(typeof Testing.assertTenantAgentRepositoryContract === 'function', 'testing export missing')
    assert(typeof Starter.apply === 'function', 'starter export missing')
    await Testing.assertTenantAgentRepositoryContract(ctx => new SQLiteRepository(ctx, { path: ':memory:' }))

    class Partition extends RuntimePartitionProvider {
      async acquire() {
        return {
          isolation: 'logical',
          driver: {
            async create(spec) { return handle(spec.sessionId) },
            async resume(spec) { return handle(spec.sessionId) },
          },
          dispose() {},
        }
      }
    }
    const handle = sessionId => ({
      runtime: {
        followup() {}, steer() {}, inject() {}, cancel() {}, async whenIdle() {},
        async executeTool(name, args) { return { isError: false, value: { name, args }, content: [] } },
      },
      async dispose() {},
    })

    const ctx = new Context()
    await ctx.plugin(InMemoryTenantAgentRepository)
    await ctx.plugin(EmptyTenantMcpProvider)
    await ctx.plugin(UnavailableSecretProvider)
    await ctx.plugin(Partition)
    await ctx.plugin(MultiTenantService)
    const alice = createPrincipalContext({ tenantId: 'acme', principalId: 'alice' })
    const bob = createPrincipalContext({ tenantId: 'acme', principalId: 'bob' })
    const agent = await ctx.multiTenant.create(alice)
    assert(!JSON.stringify(agent).includes('session'), 'public Agent leaked internal session')
    let denied = false
    try { await ctx.multiTenant.get(bob, agent.id) } catch (error) { denied = error instanceof AgentNotFoundError }
    assert(denied, 'cross-Principal lookup did not fail closed')
    const tool = await ctx.multiTenant.withAgent(alice, agent.id, runtime => runtime.executeTool('probe', { ok: true }))
    assert(tool.value.name === 'probe', 'controlled runtime did not execute tool')
    await ctx.multiTenant.delete(alice, agent.id)
    await ctx.fiber.dispose()
    console.log('installed v0.4 Agent resource contract passed')
  `)
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: consumer, stdio: 'inherit' })
  console.log(`artifact consumer smoke passed: ${packageSpec}`)
} finally {
  rmSync(consumer, { recursive: true, force: true })
  if (packDirectory !== undefined) rmSync(packDirectory, { recursive: true, force: true })
}
