#!/usr/bin/env node
/**
 * Admission-decorator runtime proof against the repository's exact DSH baseline.
 *
 * A decorator around `ctx.agents` must be able to run tenant admission in the
 * Agent `setup` hook before `sessions.enter` for create, fork, subagent and
 * resume genesis paths.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DSH_TARGET } from './dsh-target.mjs'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-mt-admission-'))
try {
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'admission-probe', private: true, type: 'module' }))
  execFileSync('pnpm', [
    'add',
    `@deepseek-ai/dsh-agent-loop@${DSH_TARGET.version}`,
    `@deepseek-ai/dsh-agent@${DSH_TARGET.version}`,
    `@deepseek-ai/dsh-session@${DSH_TARGET.version}`,
    '@deepseek-ai/cordis@4.0.1',
  ], { cwd: tmp, stdio: 'ignore' })

  writeFileSync(join(tmp, 'probe.mjs'), [
    'import { Context } from "@deepseek-ai/cordis";',
    'import SessionStore, { SessionPreparation } from "@deepseek-ai/dsh-session";',
    'import AgentRegistry from "@deepseek-ai/dsh-agent";',
    'import AgentLoop from "@deepseek-ai/dsh-agent-loop";',
    '',
    'const seen = [];',
    'const ctx = new Context();',
    'try {',
    '  await ctx.plugin(SessionStore);',
    '  await ctx.plugin(AgentRegistry);',
    '  ctx.provide("systemPrompt", { variable() {} });',
    '  ctx.provide("llm", {});',
    '  ctx.provide("tools", {});',
    '  ctx.provide("sessionPersistence", {',
    '    prepare: (id) => SessionPreparation.create(ctx.sessions.prepare(id, {}))',
    '  });',
    '  await ctx.plugin(AgentLoop, { agents: [] });',
    '',
    '  const decorate = (agents) => {',
    '    const origCreate = agents.create.bind(agents);',
    '    const origResume = agents.resume.bind(agents);',
    '    agents.create = async (options) => {',
    '      const original = options.setup;',
    '      options.setup = async (agentCtx) => {',
    '        seen.push({ via: "create", sessionId: options.sessionId,',
    '          parentSession: options.meta?.parentSession, origin: options.meta?.origin,',
    '          inStore: ctx.sessions.get(options.sessionId) !== undefined });',
    '        return original?.(agentCtx);',
    '      };',
    '      return origCreate(options);',
    '    };',
    '    agents.resume = async (options) => {',
    '      const original = options.setup;',
    '      options.setup = async (agentCtx) => {',
    '        seen.push({ via: "resume", resumeSessionId: options.resumeSessionId,',
    '          inStore: ctx.sessions.get(options.resumeSessionId) !== undefined });',
    '        return original?.(agentCtx);',
    '      };',
    '      return origResume(options);',
    '    };',
    '  };',
    '  decorate(ctx.agents);',
    '',
    '  const parent = await ctx.agents.create({ sessionId: "p1", setup: async () => {} });',
    '  const forked = await ctx.agents.create({ sessionId: "c1", meta: { parentSession: "p1" }, setup: async () => {} });',
    '  const subagent = await ctx.agents.create({ sessionId: "c2", meta: { parentSession: "p1", origin: "subagent" }, setup: async () => {} });',
    '  const resumed = await ctx.agents.resume({ resumeSessionId: "r1", setup: async () => {} });',
    '',
    '  const inStore = (id) => ctx.sessions.get(id) !== undefined;',
    '  const result = { seen, afterCreate: { p1: inStore("p1"), c1: inStore("c1"), c2: inStore("c2"), r1: inStore("r1") } };',
    '',
    '  const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT FAILED: " + msg); };',
    '  const [P1, P2, P3, P4] = seen;',
    '  assert(P1 && P1.via === "create" && P1.sessionId === "p1" && P1.inStore === false, "P1 create: admission runs in setup before enter");',
    '  assert(P2 && P2.via === "create" && P2.parentSession === "p1" && P2.inStore === false, "P2 fork: parentSession available, before enter");',
    '  assert(P3 && P3.via === "create" && P3.origin === "subagent" && P3.parentSession === "p1" && P3.inStore === false, "P3 subagent: origin+parent available, before enter");',
    '  assert(P4 && P4.via === "resume" && P4.resumeSessionId === "r1" && P4.inStore === false, "P4 resume: resumeSessionId available, before enter");',
    '  assert(result.afterCreate.p1 && result.afterCreate.c1 && result.afterCreate.c2 && result.afterCreate.r1, "all sessions entered after create/resume");',
    '',
    '  console.log(JSON.stringify(result));',
    '  await Promise.all([parent.dispose(), forked.dispose(), subagent.dispose(), resumed.dispose()]);',
    '} finally {',
    '  ctx.dispose?.();',
    '}',
  ].join('\n'))

  const out = execFileSync('node', ['probe.mjs'], { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const result = JSON.parse(out.trim())
  const rows = result.seen.map((s) => `${s.via.padEnd(6)} ${s.sessionId ?? s.resumeSessionId}  inStore@setup=${s.inStore}`).join('\n')
  console.log(`Admission decorator proof passed on DSH ${DSH_TARGET.version}:\n${rows}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
