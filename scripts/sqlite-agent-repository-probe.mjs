#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const packageDirectory = join(root, 'packages/multi-tenant')
const directory = mkdtempSync(join(tmpdir(), 'dsh-mt-sqlite-v04-'))
const path = join(directory, 'agents.sqlite')
const moduleUrl = pathToFileURL(join(packageDirectory, 'dist/sqlite.mjs')).href
const agentId = '123e4567-e89b-42d3-a456-426614174000'
const common = { ...process.env, DSH_MT_DB: path, DSH_MT_MODULE: moduleUrl, DSH_MT_AGENT: agentId }

const run = source => execFileSync(process.execPath, ['--input-type=module', '-e', source], {
  cwd: packageDirectory,
  env: common,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})

try {
  run(`
    import { Context } from '@deepseek-ai/cordis'
    const { default: Repository } = await import(process.env.DSH_MT_MODULE)
    const ctx = new Context()
    const repository = new Repository(ctx, { path: process.env.DSH_MT_DB })
    const created = await repository.insert({
      id: process.env.DSH_MT_AGENT,
      tenantId: 'acme', principalId: 'alice', sessionId: 'internal-restart-proof',
      capabilityRevision: 'c1', mcpServers: ['shared'],
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const ready = await repository.transition({ tenantId: 'acme', principalId: 'alice' }, created.id, 0, {
      from: 'provisioning', to: 'ready', at: '2026-01-01T00:00:01.000Z',
    })
    if (ready?.state !== 'ready') throw new Error('first process did not publish ready record')
    await ctx.fiber.dispose()
  `)
  run(`
    import { Context } from '@deepseek-ai/cordis'
    const { default: Repository } = await import(process.env.DSH_MT_MODULE)
    const ctx = new Context()
    const repository = new Repository(ctx, { path: process.env.DSH_MT_DB })
    const owner = { tenantId: 'acme', principalId: 'alice' }
    const ready = await repository.get(owner, process.env.DSH_MT_AGENT)
    if (ready?.sessionId !== 'internal-restart-proof') throw new Error('restart lost internal session')
    if (await repository.get({ tenantId: 'acme', principalId: 'bob' }, process.env.DSH_MT_AGENT)) {
      throw new Error('cross-Principal lookup succeeded')
    }
    const deleted = await repository.transition(owner, ready.id, ready.revision, {
      from: 'ready', to: 'deleted', at: '2026-01-01T00:00:02.000Z',
    })
    if (deleted?.sessionId !== 'deleted:' + ready.id || deleted.mcpServers.length !== 0) {
      throw new Error('tombstone retained runtime capability data')
    }
    await ctx.fiber.dispose()
  `)
  console.log('SQLite Agent directory probe passed across independent processes')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
