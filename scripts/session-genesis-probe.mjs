#!/usr/bin/env node
/**
 * Session genesis runtime proof: confirm the static Genesis Map findings against
 * the current pinned `@deepseek-ai/dsh-session` runtime.
 *
 *   F1  — `session/created` fires AFTER the session is already in the store
 *         (get-visible), so it is not a before-visibility admission point.
 *   F2  — a synchronous `session/created` throw vetoes publication (rolls the
 *         store entry back); an async listener's rejection is logged, not vetoed.
 *
 * Run from the repo root: `node scripts/session-genesis-probe.mjs`.
 * Installs the current target into a throwaway temp dir (not the workspace).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DSH_TARGET_VERSION } from './dsh-target.mjs'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-mt-genesis-'))
try {
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'genesis-probe', private: true, type: 'module' }))
  execFileSync('pnpm', ['add', `@deepseek-ai/dsh-session@${DSH_TARGET_VERSION}`, '@deepseek-ai/cordis@4.0.1'], {
    cwd: tmp,
    stdio: 'ignore',
  })
  writeFileSync(join(tmp, 'probe.mjs'), [
    'import { Context } from "@deepseek-ai/cordis";',
    'import SessionStore from "@deepseek-ai/dsh-session";',
    '',
    'const results = {};',
    '',
    '// F1: is the session already get-visible when `session/created` fires?',
    '{',
    '  const ctx = new Context();',
    '  await ctx.plugin(SessionStore);',
    '  let visibleAtCreated = null;',
    '  ctx.on("session/created", (session) => { visibleAtCreated = ctx.sessions.get(session.id) !== undefined; });',
    '  const session = ctx.sessions.create();',
    '  results.F1 = { visibleAtCreated, idExistsAfter: ctx.sessions.get(session.id) !== undefined };',
    '}',
    '',
    '// F2a: a synchronous throw vetoes publication.',
    '{',
    '  const ctx = new Context();',
    '  await ctx.plugin(SessionStore);',
    '  ctx.on("session/created", () => { throw new Error("sync veto"); });',
    '  let threw = false;',
    '  try { ctx.sessions.create(); } catch { threw = true; }',
    '  results.F2_sync = { threw, sessionCount: ctx.sessions.list().length };',
    '}',
    '',
    '// F2b: an async rejection is logged, not vetoed.',
    '{',
    '  const ctx = new Context();',
    '  await ctx.plugin(SessionStore);',
    '  ctx.on("session/created", async () => { throw new Error("async veto"); });',
    '  let threw = false;',
    '  try { ctx.sessions.create(); } catch { threw = true; }',
    '  await new Promise(r => setTimeout(r, 20));',
    '  results.F2_async = { threw, sessionCount: ctx.sessions.list().length };',
    '}',
    '',
    'const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT FAILED: " + msg); };',
    'assert(results.F1.visibleAtCreated === true && results.F1.idExistsAfter === true, "F1: created fires after store visibility");',
    'assert(results.F2_sync.threw === true && results.F2_sync.sessionCount === 0, "F2 sync: throw vetoes and rolls back publication");',
    'assert(results.F2_async.threw === false && results.F2_async.sessionCount === 1, "F2 async: rejection does not veto publication");',
    '',
    'console.log(JSON.stringify(results));',
  ].join('\n'))
  const out = execFileSync('node', ['probe.mjs'], { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  console.log(`Session genesis proof passed on DSH ${DSH_TARGET_VERSION}: ${out.trim()}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
