#!/usr/bin/env node
/**
 * Permanent executable proof for the zero-config durable local Session store.
 *
 * The worker runs in separate Node processes so persistence is proven across
 * process lifetimes, not merely across two objects in one runtime.
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const packageDir = resolve(root, 'packages/multi-tenant')
const storeUrl = pathToFileURL(resolve(packageDir, 'dist/sqlite-store.mjs')).href
const worker = `
import { Context } from '@deepseek-ai/cordis'
const { default: SQLiteTenantSessionStore } = await import(process.env.DSH_MT_STORE_URL)
const ctx = new Context()
try {
  await ctx.plugin(SQLiteTenantSessionStore, { path: process.env.DSH_MT_DB_PATH })
  const result = await ctx.tenantSessionStore.claim(process.env.DSH_MT_SESSION_ID, {
    tenantId: process.env.DSH_MT_TENANT_ID,
    userId: process.env.DSH_MT_USER_ID,
  })
  const owner = await ctx.tenantSessionStore.get(process.env.DSH_MT_SESSION_ID)
  process.stdout.write(JSON.stringify({ result, owner }))
} finally {
  await ctx.fiber.dispose()
}
`

async function claim(dbPath, sessionId, tenantId, userId) {
  const { stdout, stderr } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', worker], {
    cwd: packageDir,
    env: {
      ...process.env,
      DSH_MT_STORE_URL: storeUrl,
      DSH_MT_DB_PATH: dbPath,
      DSH_MT_SESSION_ID: sessionId,
      DSH_MT_TENANT_ID: tenantId,
      DSH_MT_USER_ID: userId,
    },
    maxBuffer: 1024 * 1024,
  })
  if (stderr.trim()) process.stderr.write(stderr)
  return JSON.parse(stdout)
}

function assert(condition, message) {
  if (!condition) throw new Error(`SQLite durable-local probe failed: ${message}`)
}

const temp = mkdtempSync(join(tmpdir(), 'dsh-mt-sqlite-probe-'))
const dbPath = join(temp, 'session-ownership.sqlite')

try {
  const created = await claim(dbPath, 'restart-session', 'acme', 'alice')
  assert(created.result === 'created', `first claim returned ${created.result}`)

  // A fresh process must see the same immutable winner.
  const resumedOwner = await claim(dbPath, 'restart-session', 'acme', 'alice')
  assert(resumedOwner.result === 'idempotent', `same owner after restart returned ${resumedOwner.result}`)
  assert(resumedOwner.owner?.tenantId === 'acme' && resumedOwner.owner?.userId === 'alice', 'persisted owner changed')

  const siblingDenied = await claim(dbPath, 'restart-session', 'acme', 'bob')
  assert(siblingDenied.result === 'conflict', `cross-Principal claim returned ${siblingDenied.result}`)

  const tenantDenied = await claim(dbPath, 'restart-session', 'globex', 'alice')
  assert(tenantDenied.result === 'conflict', `cross-Tenant claim returned ${tenantDenied.result}`)

  // Two separate processes competing for a new id must produce exactly one
  // winner, proving SQLite serialization rather than get-then-set behavior.
  const race = await Promise.all([
    claim(dbPath, 'race-session', 'acme', 'alice'),
    claim(dbPath, 'race-session', 'acme', 'bob'),
  ])
  const outcomes = race.map(item => item.result).sort()
  assert(JSON.stringify(outcomes) === JSON.stringify(['conflict', 'created']), `race outcomes were ${JSON.stringify(outcomes)}`)
  assert(race[0].owner?.tenantId === race[1].owner?.tenantId && race[0].owner?.userId === race[1].owner?.userId, 'race processes observed different winners')

  console.log(JSON.stringify({
    sqliteDurableLocal: 'passed',
    restartOwner: resumedOwner.owner,
    siblingPrincipal: siblingDenied.result,
    crossTenant: tenantDenied.result,
    multiProcessRace: outcomes,
  }))
} finally {
  rmSync(temp, { recursive: true, force: true })
}
