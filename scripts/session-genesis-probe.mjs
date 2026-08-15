#!/usr/bin/env node
/**
 * Session genesis runtime probe (M2): confirm the static Genesis Map findings
 * against a real `@deepseek-ai/dsh-session` runtime.
 *
 *   F1  — `session/created` fires AFTER the session is already in the store
 *         (get-visible), so it is not a before-visibility admission point.
 *   F2  — a synchronous `session/created` throw vetoes publication (rolls the
 *         store entry back); an async listener's rejection is logged, not
 *         vetoed.
 *
 * Run from the repo root: `node scripts/session-genesis-probe.mjs`.
 * Installs the pinned prerelease into a throwaway temp dir (not the workspace).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-mt-genesis-'))
try {
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'genesis-probe', private: true, type: 'module' }))
  execFileSync('pnpm', ['add', '@deepseek-ai/dsh-session@0.1.0-rc.6', '@deepseek-ai/cordis@4.0.1'], {
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
    'console.log(JSON.stringify(results));',
  ].join('\n'))
  const out = execFileSync('node', ['probe.mjs'], { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  console.log(out.trim())
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
