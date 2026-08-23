#!/usr/bin/env node
/**
 * Cordis lifecycle proof for the v0.3 Operation design.
 *
 * Proves two facts we must treat as architecture constraints rather than guesses:
 * 1. child fibers are lifetime-owned by their parent and parent disposal drains them;
 * 2. ctx.inject() is dependency-reactive and can re-run its callback when a required
 *    service disappears and later returns.
 *
 * The second fact is intentionally a warning for v0.3: a one-shot user Operation
 * must not equate a raw reactive inject callback with exactly-once business work.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const runtimePackage = JSON.parse(readFileSync(join(root, 'packages/multi-tenant/package.json'), 'utf8'))
const cordisSpec = runtimePackage.devDependencies?.['@deepseek-ai/cordis']
const versionMatch = typeof cordisSpec === 'string' && cordisSpec.match(/\d+\.\d+\.\d+/)
if (!versionMatch) throw new Error(`cannot resolve exact Cordis probe baseline from ${String(cordisSpec)}`)
const cordisVersion = versionMatch[0]

const tmp = mkdtempSync(join(tmpdir(), 'dsh-mt-cordis-operation-'))
try {
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'cordis-operation-probe', private: true, type: 'module' }))
  execFileSync('pnpm', ['add', `@deepseek-ai/cordis@${cordisVersion}`], {
    cwd: tmp,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  writeFileSync(join(tmp, 'probe.mjs'), `
import { Context } from '@deepseek-ai/cordis'

const assert = (condition, message) => {
  if (!condition) throw new Error('ASSERT FAILED: ' + message)
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 2000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('TIMEOUT: ' + message)
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

const root = new Context()

// A3: parent disposal owns and drains child fibers/effects.
let parentCleanups = 0
let childCleanups = 0
let childRuns = 0
let childFiber

const dependencyProvider = root.plugin(function dependencyProvider(ctx) {
  ctx.provide('probeDependency', 'stable')
})
await dependencyProvider

const parentFiber = root.plugin(function parentOperationOwner(ctx) {
  ctx.effect(() => () => { parentCleanups += 1 }, 'parent-cleanup')
  childFiber = ctx.inject(['probeDependency'], function derivedOperation(operationCtx) {
    childRuns += 1
    assert(operationCtx.get('probeDependency') === 'stable', 'derived operation must resolve parent-visible dependency')
    operationCtx.effect(() => () => { childCleanups += 1 }, 'child-cleanup')
  })
})
await parentFiber
await childFiber

assert(childRuns === 1, 'derived child must load once while dependency is stable')
await parentFiber.dispose()
assert(parentCleanups === 1, 'parent cleanup must run exactly once')
assert(childCleanups === 1, 'parent disposal must drain child cleanup')
assert(childFiber.uid === null, 'child fiber must be disposed with parent')
await dependencyProvider.dispose()

// A4: inject is reactive. Service loss unloads callback effects; service restore can re-run it.
let reactiveRuns = 0
let reactiveCleanups = 0
const observedValues = []

const providerOne = root.plugin(function providerOne(ctx) {
  ctx.provide('reactiveDependency', 'v1')
})
await providerOne

const reactiveFiber = root.inject(['reactiveDependency'], function reactiveConsumer(ctx) {
  reactiveRuns += 1
  observedValues.push(ctx.get('reactiveDependency'))
  ctx.effect(() => () => { reactiveCleanups += 1 }, 'reactive-cleanup')
})
await reactiveFiber
assert(reactiveRuns === 1 && observedValues[0] === 'v1', 'reactive inject must initially run with v1')

await providerOne.dispose()
await waitFor(() => reactiveCleanups === 1, 'reactive callback did not unload after dependency loss')

const providerTwo = root.plugin(function providerTwo(ctx) {
  ctx.provide('reactiveDependency', 'v2')
})
await providerTwo
await waitFor(() => reactiveRuns === 2, 'reactive callback did not re-run after dependency restore')
assert(observedValues[1] === 'v2', 'reloaded inject callback must see replacement dependency')

await reactiveFiber.dispose()
await providerTwo.dispose()
assert(reactiveCleanups === 2, 'each reactive callback run must own exactly one cleanup')

console.log(JSON.stringify({
  childOwnership: { childRuns, parentCleanups, childCleanups },
  reactiveInjection: { reactiveRuns, reactiveCleanups, observedValues },
}))
`)

  const out = execFileSync('node', ['probe.mjs'], {
    cwd: tmp,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log(`Cordis operation lifecycle proof passed on ${cordisVersion}: ${out.trim()}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
