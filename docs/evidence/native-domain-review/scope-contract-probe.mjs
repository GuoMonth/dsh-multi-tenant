/**
 * Executable counterexamples for the #68 architecture assessment.
 * Uses the repository's installed rc.2 Scope and ToolRuntime primitives.
 * This is NOT a full AgentPresets, Agent lifecycle, or Web integration test.
 * Run from the repository: node docs/evidence/native-domain-review/scope-contract-probe.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(new URL('../../../packages/multi-tenant/package.json', import.meta.url))
const dependency = name => import(pathToFileURL(require.resolve(name)).href)
const { Context } = await dependency('@deepseek-ai/cordis')
const { createScope, bindScopeParent, scopeChainOf } = await dependency('@deepseek-ai/dsh-scope')
const { default: SystemPrompt } = await dependency('@deepseek-ai/dsh-system-prompt')
const { default: ToolRuntime } = await dependency('@deepseek-ai/dsh-tools')

async function host() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  return ctx
}

async function layer(ctx, id) {
  const key = { id }
  let scope
  await ctx.plugin(Object.assign(inner => { scope = createScope(inner, key) }, {
    inject: ['tools', 'systemPrompt'],
  }))
  return { key, scope }
}

const tool = description => ({
  name: 'principal_capability',
  description,
  parameters: { type: 'object', properties: {} },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async () => description,
})

const a = await host()
const b = await host()
try {
  const preset = await layer(a, 'preset')
  const parent = await layer(a, 'parent')
  const child = await layer(a, 'child')
  bindScopeParent(parent.key, preset.key)
  bindScopeParent(child.key, preset.key)
  parent.scope.ctx.tools.register(tool('parent-secret'))

  assert.ok(a.tools.get('principal_capability', parent.key))
  assert.equal(a.tools.get('principal_capability', child.key), undefined)
  assert.ok(!scopeChainOf(child.key).includes(parent.key))
  console.log('PASS: sibling joins to one preset do not inherit the parent Agent overlay')

  assert.throws(() => bindScopeParent(child.key, parent.key), /already bound/)
  console.log('PASS: a second binder cannot replace the native preset owner')

  preset.scope.ctx.tools.register(tool('preset-secret'))
  child.scope.ctx.tools.restrict({ allow: [] })
  assert.equal(a.tools.get('principal_capability', child.key), undefined)
  const undo = child.scope.ctx.tools.register(tool('copied-child-secret'))
  assert.equal(a.tools.get('principal_capability', child.key)?.description, 'copied-child-secret')
  undo()
  assert.equal(a.tools.get('principal_capability', child.key), undefined)
  console.log('PASS: copying a tool into the child own layer bypasses its inherited-tool filter')

  const otherPreset = await layer(b, 'preset')
  const otherChild = await layer(b, 'child')
  bindScopeParent(otherChild.key, otherPreset.key)
  otherPreset.scope.ctx.tools.register(tool('other-domain-secret'))
  assert.equal(b.tools.get('principal_capability', otherChild.key)?.description, 'other-domain-secret')
  assert.equal(a.tools.get('principal_capability', parent.key)?.description, 'parent-secret')
  otherChild.scope.ctx.tools.restrict({ allow: [] })
  assert.equal(b.tools.get('principal_capability', otherChild.key), undefined)
  console.log('PASS: separate native registries isolate same-name tools and retain preset filtering')
} finally {
  const cleanup = await Promise.allSettled([a.fiber.dispose(), b.fiber.dispose()])
  const errors = cleanup.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
  if (errors.length) throw new AggregateError(errors, 'scope probe cleanup failed')
}
